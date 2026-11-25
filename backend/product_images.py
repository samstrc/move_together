"""Pictures for the products Dolly finds, and a check that they're really for sale.

Each product's picture comes from its own page: the image the store puts
there for link previews (og:image), its product data (JSON-LD), or, on
Amazon, the main product image. That's always the right product, unlike an
image search, which often returns a similar product or a review site's
photo.

Some stores (Walmart, Home Depot, ...) block pages from being read by
programs. Their products get no picture, and the page shows a placeholder.

Reading the page also catches products Dolly shouldn't show, because web
search often returns old pages:
- links that don't exist (the store says "not found"), or that the store
  now sends to a category page or its home page,
- products the store marks as discontinued, sold out, or out of stock (in
  its product data, or in plain words like "no longer available"),
and it reads the current price from the page when the store gives one.

The links come from the model, so fetching them is guarded: https only,
public addresses only (checked again after every redirect), a few seconds
at most, and only the start of the page is read. Otherwise a bad link could
make the server fetch something on its own network.
"""

import ipaddress
import json
import re
import socket
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from html import unescape
from urllib.parse import urljoin, urlparse
from urllib.error import HTTPError
from urllib.request import HTTPRedirectHandler, Request, build_opener

from shopping import is_listing_page

TIMEOUT_SECONDS = 4
MAX_BYTES = 1_500_000  # product data can be far down a big page

# Stores send a "please confirm you're human" page to unknown programs. A
# normal browser's headers get the real page from most of them.
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/130 Safari/537.36",
    "Accept": "text/html",
    "Accept-Language": "en-US",
}

# Tried in order; the first match wins.
META_IMAGE = [
    re.compile(r'<meta[^>]+(?:property|name)=["\'](?:og:image(?::secure_url|:url)?|twitter:image(?::src)?)["\'][^>]*content=["\']([^"\']+)', re.I),
    re.compile(r'<meta[^>]+content=["\']([^"\']+)["\'][^>]*(?:property|name)=["\'](?:og:image(?::secure_url|:url)?|twitter:image(?::src)?)["\']', re.I),
    re.compile(r'data-old-hires=["\'](https://[^"\']+)'),  # Amazon's main product image
    re.compile(r'<link[^>]+rel=["\']image_src["\'][^>]*href=["\']([^"\']+)', re.I),
    re.compile(r'<meta[^>]+itemprop=["\']image["\'][^>]*content=["\']([^"\']+)', re.I),
    re.compile(r'<img[^>]+itemprop=["\']image["\'][^>]*src=["\']([^"\']+)', re.I),
]
JSON_LD = re.compile(r'<script[^>]+application/ld\+json[^>]*>(.*?)</script>', re.S | re.I)


def is_public_https(url: str) -> bool:
    """Whether a link is https and its host only has public internet addresses."""
    link = urlparse(url)
    if link.scheme != "https" or not link.hostname:
        return False
    try:
        addresses = socket.getaddrinfo(link.hostname, link.port or 443, proto=socket.IPPROTO_TCP)
    except OSError:
        return False
    return all(ipaddress.ip_address(info[4][0]).is_global for info in addresses)


class CheckRedirects(HTTPRedirectHandler):
    """Follow redirects only to public https addresses."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if not is_public_https(urljoin(req.full_url, newurl)):
            return None  # stop here instead of following it
        return super().redirect_request(req, fp, code, msg, headers, newurl)


opener = build_opener(CheckRedirects)


def json_ld_products(html: str) -> list[dict]:
    """The Product entries in the page's structured product data (JSON-LD)."""
    products = []
    for block in JSON_LD.findall(html):
        try:
            data = json.loads(block)
        except ValueError:
            continue
        things = data if isinstance(data, list) else data.get("@graph", [data]) if isinstance(data, dict) else []
        # A product with variants (sizes, colors) can keep its details on them.
        things = [*things, *(v for t in things if isinstance(t, dict)
                             for v in (t.get("hasVariant") or []) if isinstance(v, dict))]
        products += [t for t in things if isinstance(t, dict) and "Product" in str(t.get("@type"))]
    return products


def image_from_json_ld(html: str) -> str | None:
    """The "image" of a Product in the page's structured product data."""
    for product in json_ld_products(html):
        image = product.get("image")
        if isinstance(image, list):
            image = image[0] if image else None
        if isinstance(image, dict):
            image = image.get("contentUrl") or image.get("url")
        if isinstance(image, str):
            return image
    return None


def offers(html: str) -> list[dict]:
    """The offers (price, availability) in the page's product data."""
    found = []
    for product in json_ld_products(html):
        offer = product.get("offers")
        for o in offer if isinstance(offer, list) else [offer]:
            if isinstance(o, dict):
                found.append(o)
                found += [x for x in o.get("offers") or [] if isinstance(x, dict)]  # AggregateOffer
    return found


# schema.org availability values that mean you can't buy it now.
NOT_FOR_SALE = ("discontinued", "outofstock", "soldout", "outofstockonline")
FOR_SALE = ("instock", "limitedavailability", "onlineonly", "instoreonly", "preorder", "backorder")
META_AVAILABILITY = re.compile(
    r'<meta[^>]+(?:property|name|itemprop)=["\'](?:og:availability|product:availability|availability)["\'][^>]*content=["\']([^"\']+)',
    re.I)
# Plain-words signs on the page itself. Only checked when the product data
# doesn't say it's in stock (pages also show other, related products).
GONE_WORDS = re.compile(
    r"(?:this (?:item|product) (?:is|has been) (?:no longer available|discontinued)"
    r"|(?:item|product) (?:is )?no longer (?:available|sold|carried)"
    r"|this (?:item|product) is discontinued"
    r"|currently unavailable\.? we don.t know when)",
    re.I)
# Pages stores send to programs instead of the real page (Walmart, Amazon,
# Cloudflare, Akamai, ...).
BOT_CHECK = re.compile(
    r"<title[^>]*>\s*(?:Robot or human\?|Robot Check|Just a moment|Attention Required|Access Denied"
    r"|Pardon Our Interruption|Site Maintenance|Are you a human)",
    re.I)
NOT_FOUND_TITLE = re.compile(r"<title[^>]*>[^<]*(?:page not found|not found|\b404\b|no longer available|discontinued)", re.I)


def availability(html: str) -> str | None:
    """'for sale', 'not for sale', or None when the page doesn't say."""
    values = [str(o.get("availability", "")) for o in offers(html)]
    values += META_AVAILABILITY.findall(html)
    values = [v.lower().replace(" ", "").replace("_", "").rsplit("/", 1)[-1] for v in values if v]
    if any(v in FOR_SALE for v in values):
        return "for sale"
    if any(v in NOT_FOR_SALE or v in ("oos", "discontinued") for v in values):
        return "not for sale"
    if GONE_WORDS.search(html):
        return "not for sale"
    return None


def price_from_page(html: str) -> float | None:
    """The product's current US dollar price from its product data, if given."""
    for offer in offers(html):
        currency = str(offer.get("priceCurrency", "USD")).upper()
        price = offer.get("price", offer.get("lowPrice"))
        if currency != "USD" or price in (None, ""):
            continue
        try:
            value = float(str(price).replace("$", "").replace(",", ""))
        except ValueError:
            continue
        if value > 0:
            return value
    return None


@dataclass
class PageInfo:
    missing: bool = False  # no such product (any more): leave it out
    reason: str = ""  # why it's missing, for Dolly
    checked: bool = True  # False when the store wouldn't let us read the page
    image: str | None = None
    price: float | None = None  # the current price on the page, if it says


def find_image(html: str, url: str) -> str | None:
    """The product's picture from its page, or None if it doesn't have one."""
    image = image_from_json_ld(html)
    if image is None:
        for pattern in META_IMAGE:
            match = pattern.search(html)
            if match:
                image = match.group(1)
                break
    if image is None:
        return None
    image = urljoin(url, unescape(image).strip())
    # Some stores still write http:// links for pictures they also serve over https.
    if image.startswith("http://"):
        image = "https://" + image[len("http://"):]
    return image if image.startswith("https://") else None


def look_up_page(url: str) -> PageInfo:
    """Read a product page: can you buy it, what's its picture and price?
    Anything we can't tell (blocked, too slow, ...) counts as there but
    unchecked, with no picture.
    """
    if not is_public_https(url):
        return PageInfo(checked=False)
    try:
        with opener.open(Request(url, headers=HEADERS), timeout=TIMEOUT_SECONDS) as response:
            final_url = response.geturl()
            if "html" not in response.headers.get("Content-Type", ""):
                return PageInfo(checked=False)
            html = response.read(MAX_BYTES).decode("utf-8", "ignore")
    except HTTPError as error:
        if error.code in (404, 410):
            return PageInfo(missing=True, reason="the store says this page doesn't exist")
        return PageInfo(checked=False)
    except Exception:
        return PageInfo(checked=False)
    # A tiny page that mentions a captcha is a challenge page, not a product
    # (real product pages are big and may load a captcha script for sign-in).
    if BOT_CHECK.search(html[:5000]) or (len(html) < 20_000 and "captcha" in html.lower()):
        return PageInfo(checked=False)  # a bot check, not the real page

    # Stores send old product links to a category page or their home page.
    moved = urlparse(final_url)
    if final_url != url and (moved.path in ("", "/") or is_listing_page(final_url)):
        return PageInfo(missing=True, reason="the store now sends this link to a category or home page, "
                                             "so the product is gone")
    if NOT_FOUND_TITLE.search(html) and not json_ld_products(html):
        return PageInfo(missing=True, reason="the store says this product isn't available any more")
    if availability(html) == "not for sale":
        return PageInfo(missing=True, reason="the store lists it as discontinued or out of stock")
    return PageInfo(image=find_image(html, final_url), price=price_from_page(html))


def look_up_pages(urls: list[str]) -> list[PageInfo]:
    """look_up_page for several pages at once (each one takes a second or two)."""
    if not urls:
        return []
    with ThreadPoolExecutor(max_workers=len(urls)) as pool:
        return list(pool.map(look_up_page, urls))
