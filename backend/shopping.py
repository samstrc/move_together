"""Products Dolly finds: saving them as options for list items, with their
prices. Used by Dolly's tools in dolly_agent.py.

Each function takes the database connection and the move_id that the caller
already checked the user belongs to, and only touches that move's data.

save_product returns a "card": a small dict with a "type" that the Dolly page
draws as a box under her reply.
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


def save_product(db: Connection[DictRow], move_id: int, item_id: int | None, title: str,
                 retailer: str, url: str, price: Decimal, item_name: str | None = None,
                 category_id: int | None = None) -> dict:
    """Save a real product with its current price. The same URL is one
    product, so saving it again just adds a new price.

    With item_id, it becomes an option for that list item. Without one (it's
    for something not on the list yet), item_name and category_id say what
    the item would be: the card's "Add to list" button adds it, with this
    product as an option (see add_item in items_routes.py).
    """
    if not url.startswith(("https://", "http://")):
        raise HTTPException(400, "The product link must start with https://")
    if is_listing_page(url):
        raise HTTPException(400, "That's a search or category page, not one product. "
                                 "Save the product's own page instead.")
    if item_id is not None:
        item_name = get_move_item(db, move_id, item_id)["name"]
    elif not item_name:
        raise HTTPException(400, "Say which list item this product is for")
    product = db.execute(
        """
        INSERT INTO products (retailer, title, url) VALUES (%s, %s, %s)
        ON CONFLICT (url) DO UPDATE SET title = EXCLUDED.title, retailer = EXCLUDED.retailer
        RETURNING product_id
        """,
        (retailer.strip()[:100], title.strip()[:255], url.strip()),
    ).fetchone()
    assert product is not None  # INSERT ... RETURNING always returns the row
    record_price(db, product["product_id"], price)
    if item_id is not None:
        db.execute(
            "INSERT INTO item_product_options (item_id, product_id) VALUES (%s, %s) ON CONFLICT DO NOTHING",
            (item_id, product["product_id"]),
        )
        log_activity(db, move_id, None, "product_suggested", "item", item_id,
                     {"product_id": product["product_id"], "price": price})
    return {
        "type": "product",
        "product_id": product["product_id"],
        "item_id": item_id,
        "item_name": item_name,
        "category_id": category_id,
        "title": title.strip(),
        "retailer": retailer.strip(),
        "url": url.strip(),
        "price": price,
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
        SELECT DISTINCT ON (p.product_id)
               card.content::jsonb ->> 'item_name' AS for_item, p.product_id, p.title, p.retailer, p.url,
               (SELECT price FROM product_prices pp WHERE pp.product_id = p.product_id
                ORDER BY fetched_at DESC LIMIT 1) AS price
        FROM ai_messages card
        JOIN ai_conversations c ON c.conversation_id = card.conversation_id
        JOIN products p ON p.product_id = (card.content::jsonb ->> 'product_id')::int
        WHERE c.move_id = %s AND card.role = 'tool' AND card.tool_name = 'save_product'
          AND card.content::jsonb ->> 'item_id' IS NULL
          -- Once the item is added, the product is one of its options instead.
          AND NOT EXISTS (SELECT 1 FROM item_product_options o JOIN items i ON i.item_id = o.item_id
                          WHERE o.product_id = p.product_id AND i.move_id = %s)
        ORDER BY p.product_id
        """,
        (move_id, move_id),
    ).fetchall()
