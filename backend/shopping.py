"""Products Dolly finds: saving them as options for list items, with their
prices. Used by Dolly's tools in dolly_agent.py.

Each function takes the database connection and the move_id that the caller
already checked the user belongs to, and only touches that move's data.

save_products returns a "card": a small dict with a "type" that the Dolly
page draws as a box under her reply.
"""

import json
import re
from decimal import Decimal
from urllib.parse import parse_qs, urlparse

from fastapi import HTTPException
from psycopg import Connection
from psycopg.rows import DictRow


def log_activity(db: Connection[DictRow], move_id: int, actor_id: int | None, action: str,
                 entity_type: str, entity_id: int, details: dict) -> None:
    """Add a row to the activity log. actor_id None = Dolly or the system did it."""
    db.execute(
        """
        INSERT INTO activity (move_id, actor_id, action, entity_type, entity_id, details)
        VALUES (%s, %s, %s, %s, %s, %s)
        """,
        (move_id, actor_id, action, entity_type, entity_id, json.dumps(details, default=str)),
    )


def get_move_item(db: Connection[DictRow], move_id: int, item_id: int) -> dict:
    """The item, or a 404 if it isn't in this move."""
    item = db.execute(
        "SELECT item_id, name, category_id, quantity FROM items WHERE item_id = %s AND move_id = %s",
        (item_id, move_id),
    ).fetchone()
    if item is None:
        raise HTTPException(404, "Item not found")
    return item


def record_price(db: Connection[DictRow], product_id: int, price: Decimal) -> None:
    """Add a price to the product's history.

    clock_timestamp() rather than now(): now() is the same for the whole
    transaction, which would clash with the (product_id, fetched_at) key if a
    price is saved twice in one request.
    """
    db.execute(
        "INSERT INTO product_prices (product_id, fetched_at, price) VALUES (%s, clock_timestamp(), %s)",
        (product_id, price),
    )


# ---------- Products ----------

# Path parts that mean a page lists many products (search results, a
# category, a collection) and parts that mean it's one product's page, e.g.
# walmart.com/browse/... vs walmart.com/ip/..., target.com/c/... vs /p/...
LISTING_PARTS = {"search", "browse", "s", "c", "cp", "cat", "category", "categories", "collections", "shop"}
PRODUCT_PARTS = {"p", "ip", "dp", "product", "products", "itm"}


# What a product page's path looks like at big stores. Their other pages
# (categories, deals, ...) have many different shapes, so for these stores a
# link is only accepted if it looks like a product page.
STORE_PRODUCT_PATHS = {
    "walmart.com": r"/ip/",
    "target.com": r"/p/",
    "amazon.com": r"/(dp|gp/product)/",
    "ikea.com": r"/p/",
    "wayfair.com": r"/pdp/",
    "homedepot.com": r"/p/",
    "lowes.com": r"/pd/",
    "bestbuy.com": r"/site/.+\.p$",
    "costco.com": r"\.product\.",
}


def is_listing_page(url: str) -> bool:
    """Whether a link is a search or category page rather than one product."""
    link = urlparse(url)
    host = (link.hostname or "").lower().removeprefix("www.")
    for store, product_path in STORE_PRODUCT_PATHS.items():
        if host == store or host.endswith("." + store):
            return not re.search(product_path, link.path.lower())
    parts = {part.lower() for part in link.path.split("/") if part}
    if {"q", "k", "query", "search", "searchterm"} & {key.lower() for key in parse_qs(link.query)}:
        return True
    return bool(parts & LISTING_PARTS) and not parts & PRODUCT_PARTS


def product_in_move(db: Connection[DictRow], move_id: int, product_id: int) -> bool:
    """Whether this group has seen this product: it's an option or the pick
    for one of their items, or it was on one of Dolly's cards in their chats.
    Products are shared between groups, so without this check a request could
    pick any product in the database by its ID.
    """
    row = db.execute(
        """
        SELECT EXISTS (
                   SELECT 1 FROM item_product_options o JOIN items i ON i.item_id = o.item_id
                   WHERE i.move_id = %(m)s AND o.product_id = %(p)s)
            OR EXISTS (
                   SELECT 1 FROM items WHERE move_id = %(m)s AND selected_product_id = %(p)s)
            OR EXISTS (
                   SELECT 1 FROM ai_messages am
                   JOIN ai_conversations c ON c.conversation_id = am.conversation_id
                   WHERE c.move_id = %(m)s AND am.role = 'tool' AND am.content IS NOT NULL
                     AND (am.content::jsonb -> 'options' @> jsonb_build_array(jsonb_build_object('product_id', %(p)s::int))
                          OR am.content::jsonb ->> 'product_id' = %(p)s::text
                          OR am.content::jsonb -> 'item' ->> 'product_id' = %(p)s::text)) AS ok
        """,
        {"m": move_id, "p": product_id},
    ).fetchone()
    return bool(row and row["ok"])


def require_product_in_move(db: Connection[DictRow], move_id: int, product_id: int) -> None:
    """400 unless this group has seen the product (see product_in_move)."""
    if not product_in_move(db, move_id, product_id):
        raise HTTPException(400, "That product isn't one of your group's options")


def check_product_link(url: str) -> None:
    """400 unless the link is one product's own page."""
    if not url.startswith(("https://", "http://")):
        raise HTTPException(400, "The product link must start with https://")
    if is_listing_page(url):
        raise HTTPException(400, "That's a search or category page, not one product. "
                                 "Save the product's own page instead.")


def save_products(db: Connection[DictRow], move_id: int, item_id: int | None,
                  item_name: str | None, category_id: int | None, products: list[dict]) -> dict:
    """Save real products Dolly found as choices for one list item, each with
    its current price, and return the card that shows them.

    products: dicts with title, retailer, url, price, and image_url (or None).
    The same URL is one product, so saving it again just adds a new price.

    With item_id, they become options for that item, and the user picks one
    (see choose_product in items_routes.py). Without one (it's for something
    not on the list yet), item_name and category_id say what the item would
    be, and picking one adds the item (see add_item in items_routes.py).
    """
    if item_id is not None:
        item_name = get_move_item(db, move_id, item_id)["name"]
    elif not item_name:
        raise HTTPException(400, "Say which list item these products are for")
    options = []
    for product in products:
        check_product_link(product["url"])
        row = db.execute(
            """
            INSERT INTO products (retailer, title, url) VALUES (%s, %s, %s)
            ON CONFLICT (url) DO UPDATE SET title = EXCLUDED.title, retailer = EXCLUDED.retailer
            RETURNING product_id
            """,
            (product["retailer"].strip()[:100], product["title"].strip()[:255], product["url"].strip()),
        ).fetchone()
        assert row is not None  # INSERT ... RETURNING always returns the row
        record_price(db, row["product_id"], product["price"])
        if item_id is not None:
            db.execute(
                "INSERT INTO item_product_options (item_id, product_id) VALUES (%s, %s) ON CONFLICT DO NOTHING",
                (item_id, row["product_id"]),
            )
        options.append({
            "product_id": row["product_id"],
            "title": product["title"].strip(),
            "retailer": product["retailer"].strip(),
            "url": product["url"].strip(),
            "price": product["price"],
            "image_url": product.get("image_url"),
        })
    if item_id is not None:
        log_activity(db, move_id, None, "products_suggested", "item", item_id,
                     {"product_ids": [o["product_id"] for o in options]})
    return {
        "type": "products",
        "item_id": item_id,
        "item_name": item_name,
        "category_id": category_id,
        "options": options,
    }


def list_product_options(db: Connection[DictRow], move_id: int, item_id: int | None = None) -> list[dict]:
    """Products saved for this move's items (or one item), with latest prices."""
    return db.execute(
        """
        SELECT i.item_id, i.name AS item_name, p.product_id, p.title, p.retailer, p.url,
               (SELECT price FROM product_prices pp WHERE pp.product_id = p.product_id
                ORDER BY fetched_at DESC LIMIT 1) AS price,
               (i.selected_product_id = p.product_id) AS selected
        FROM item_product_options o
        JOIN items i    ON i.item_id    = o.item_id
        JOIN products p ON p.product_id = o.product_id
        WHERE i.move_id = %s AND (%s::int IS NULL OR i.item_id = %s)
        ORDER BY i.name, price
        """,
        (move_id, item_id, item_id),
    ).fetchall()



def list_unlisted_products(db: Connection[DictRow], move_id: int) -> list[dict]:
    """Products Dolly found in this move's chats for things that aren't on the
    list (yet), with latest prices. They aren't linked to an item, so the
    only record of which move they're for is the card in the chat.
    """
    return db.execute(
        """
        WITH cards AS (
            SELECT m.content::jsonb AS card
            FROM ai_messages m JOIN ai_conversations c ON c.conversation_id = m.conversation_id
            WHERE c.move_id = %s AND m.role = 'tool' AND m.content IS NOT NULL
        ), found AS (
            -- A card with several choices ...
            SELECT card ->> 'item_name' AS for_item, (o ->> 'product_id')::int AS product_id
            FROM cards, jsonb_array_elements(card -> 'options') o
            WHERE card ->> 'type' = 'products' AND card ->> 'item_id' IS NULL
            UNION ALL
            -- ... or an older card with one.
            SELECT card ->> 'item_name', (card ->> 'product_id')::int
            FROM cards
            WHERE card ->> 'type' = 'product' AND card ->> 'item_id' IS NULL
        )
        SELECT DISTINCT ON (p.product_id)
               f.for_item, p.product_id, p.title, p.retailer, p.url,
               (SELECT price FROM product_prices pp WHERE pp.product_id = p.product_id
                ORDER BY fetched_at DESC LIMIT 1) AS price
        FROM found f
        JOIN products p ON p.product_id = f.product_id
        -- Once the item is added, the product is one of its options instead.
        WHERE NOT EXISTS (SELECT 1 FROM item_product_options o JOIN items i ON i.item_id = o.item_id
                          WHERE o.product_id = p.product_id AND i.move_id = %s)
        ORDER BY p.product_id
        """,
        (move_id, move_id),
    ).fetchall()
