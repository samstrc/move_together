-- Move Together database schema + seed data (Stage 3 design).
--
-- Docker runs this automatically the first time the database is created.
-- To rebuild from scratch after editing it:
--   docker compose down -v && docker compose up -d
--
-- `moves` is the hub: almost every table has a move_id, which keeps each
-- household's data separate. (The app UI calls a move a "group".)
--
-- Conventions:
--   * Deleting a move deletes everything that belongs to it (ON DELETE CASCADE).
--   * Columns that point to users are named for the role that person played
--     (created_by, added_by, paid_by, actor_id, ...). A NULL added_by or
--     actor_id means the AI assistant or the system did it.
--   * Users who have history (created a move, paid an expense, ...) can't be
--     deleted outright; the app should deactivate them instead.

-- ============================================================
-- People & groups
-- ============================================================

-- Accounts.
CREATE TABLE users (
    user_id       SERIAL PRIMARY KEY,
    email         VARCHAR(255) NOT NULL UNIQUE,
    name          VARCHAR(100) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- One household move.
CREATE TABLE moves (
    move_id     SERIAL PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    destination VARCHAR(255),
    target_date DATE,
    created_by  INT          NOT NULL REFERENCES users(user_id),
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Which users are in which move. The composite key stops someone joining the
-- same move twice. split_weight controls cost sharing: 2 pays twice as much as 1.
CREATE TABLE move_members (
    move_id      INT          NOT NULL REFERENCES moves(move_id) ON DELETE CASCADE,
    user_id      INT          NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    role         VARCHAR(20)  NOT NULL DEFAULT 'member'
                 CHECK (role IN ('owner', 'member')),
    move_in_date DATE,
    split_weight NUMERIC(5,2) NOT NULL DEFAULT 1 CHECK (split_weight > 0),
    joined_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    PRIMARY KEY (move_id, user_id)
);

-- Pending invites to join a move. `code` is what gets shared (e.g. MOVE-4821).
CREATE TABLE invitations (
    invite_id     SERIAL PRIMARY KEY,
    move_id       INT          NOT NULL REFERENCES moves(move_id) ON DELETE CASCADE,
    invited_by    INT          NOT NULL REFERENCES users(user_id),
    invited_email VARCHAR(255),
    code          VARCHAR(20)  NOT NULL UNIQUE,
    status        VARCHAR(10)  NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'accepted', 'declined', 'expired')),
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    expires_at    TIMESTAMPTZ
);

-- ============================================================
-- Item list
-- ============================================================

-- Lookup list shared by every move (Kitchen, Furniture, ...).
CREATE TABLE categories (
    category_id SERIAL PRIMARY KEY,
    name        VARCHAR(50) NOT NULL UNIQUE
);

-- Optional rooms within a move, for organizing items.
CREATE TABLE rooms (
    room_id SERIAL PRIMARY KEY,
    move_id INT         NOT NULL REFERENCES moves(move_id) ON DELETE CASCADE,
    name    VARCHAR(50) NOT NULL,
    UNIQUE (move_id, name)
);

-- Real products found online by the AI assistant.
-- (Created before items because items.selected_product_id points here.)
CREATE TABLE products (
    product_id SERIAL PRIMARY KEY,
    retailer   VARCHAR(100) NOT NULL,
    title      VARCHAR(255) NOT NULL,
    url        TEXT         NOT NULL UNIQUE,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Price history: one row each time a product's price is checked.
CREATE TABLE product_prices (
    product_id INT           NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
    fetched_at TIMESTAMPTZ   NOT NULL DEFAULT now(),
    price      NUMERIC(10,2) NOT NULL CHECK (price >= 0),
    PRIMARY KEY (product_id, fetched_at)
);

-- The shared list. room, responsible person, and chosen product are optional.
CREATE TABLE items (
    item_id             SERIAL PRIMARY KEY,
    move_id             INT           NOT NULL REFERENCES moves(move_id) ON DELETE CASCADE,
    name                VARCHAR(150)  NOT NULL,
    category_id         INT           REFERENCES categories(category_id),
    room_id             INT           REFERENCES rooms(room_id) ON DELETE SET NULL,
    quantity            INT           NOT NULL DEFAULT 1 CHECK (quantity > 0),
    est_cost            NUMERIC(10,2) CHECK (est_cost >= 0),
    status              VARCHAR(10)   NOT NULL DEFAULT 'needed'
                        CHECK (status IN ('needed', 'bought')),
    responsible_user_id INT           REFERENCES users(user_id),
    added_by            INT           REFERENCES users(user_id),
    selected_product_id INT           REFERENCES products(product_id) ON DELETE SET NULL,
    notes               TEXT,
    created_at          TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- Products the assistant suggested for a given item.
CREATE TABLE item_product_options (
    item_id      INT         NOT NULL REFERENCES items(item_id) ON DELETE CASCADE,
    product_id   INT         NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
    suggested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (item_id, product_id)
);

-- ============================================================
-- Budget & expenses
-- ============================================================

-- Spending limit per category for a move (one per category per move).
CREATE TABLE budgets (
    move_id     INT           NOT NULL REFERENCES moves(move_id) ON DELETE CASCADE,
    category_id INT           NOT NULL REFERENCES categories(category_id),
    amount      NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
    PRIMARY KEY (move_id, category_id)
);

-- Money actually spent. item_id is optional: not every expense is a list
-- item (e.g. a moving truck deposit).
CREATE TABLE expenses (
    expense_id   SERIAL PRIMARY KEY,
    move_id      INT           NOT NULL REFERENCES moves(move_id) ON DELETE CASCADE,
    item_id      INT           REFERENCES items(item_id) ON DELETE SET NULL,
    category_id  INT           REFERENCES categories(category_id),
    description  VARCHAR(255)  NOT NULL,
    amount       NUMERIC(10,2) NOT NULL CHECK (amount > 0),
    paid_by      INT           NOT NULL REFERENCES users(user_id),
    expense_date DATE          NOT NULL DEFAULT CURRENT_DATE,
    created_at   TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- Who owes what for each expense.
CREATE TABLE expense_splits (
    expense_id  INT           NOT NULL REFERENCES expenses(expense_id) ON DELETE CASCADE,
    user_id     INT           NOT NULL REFERENCES users(user_id),
    amount_owed NUMERIC(10,2) NOT NULL CHECK (amount_owed >= 0),
    PRIMARY KEY (expense_id, user_id)
);

-- ============================================================
-- AI assistant (Dolly)
-- ============================================================

-- One chat session with the assistant for a move.
CREATE TABLE ai_conversations (
    conversation_id SERIAL PRIMARY KEY,
    move_id         INT          NOT NULL REFERENCES moves(move_id) ON DELETE CASCADE,
    started_by      INT          NOT NULL REFERENCES users(user_id),
    title           VARCHAR(150),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Individual messages and tool actions in a chat. For role = 'tool',
-- tool_name/tool_input record what the assistant did (e.g. add_item).
CREATE TABLE ai_messages (
    message_id      SERIAL PRIMARY KEY,
    conversation_id INT         NOT NULL REFERENCES ai_conversations(conversation_id) ON DELETE CASCADE,
    role            VARCHAR(10) NOT NULL CHECK (role IN ('user', 'assistant', 'tool')),
    content         TEXT,
    tool_name       VARCHAR(50),
    tool_input      JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- Sync
-- ============================================================

-- Log of every change. Clients poll "WHERE move_id = ? AND activity_id > ?"
-- for near-real-time updates. actor_id NULL = the AI or system made the change.
CREATE TABLE activity (
    activity_id BIGSERIAL PRIMARY KEY,
    move_id     INT         NOT NULL REFERENCES moves(move_id) ON DELETE CASCADE,
    actor_id    INT         REFERENCES users(user_id),
    action      VARCHAR(50) NOT NULL,   -- e.g. 'item_added', 'expense_logged'
    entity_type VARCHAR(30),            -- e.g. 'item', 'expense'
    entity_id   INT,
    details     JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- Indexes
-- ============================================================

-- "Everything for this move" lookups the app does constantly.
CREATE INDEX idx_move_members_user  ON move_members(user_id);  -- "my moves"
CREATE INDEX idx_invitations_move   ON invitations(move_id);
CREATE INDEX idx_rooms_move         ON rooms(move_id);
CREATE INDEX idx_items_move         ON items(move_id);
CREATE INDEX idx_expenses_move      ON expenses(move_id);
CREATE INDEX idx_ai_conv_move       ON ai_conversations(move_id);
CREATE INDEX idx_ai_messages_conv   ON ai_messages(conversation_id);
CREATE INDEX idx_activity_move      ON activity(move_id, activity_id);

-- Full-text search on the item list.
CREATE INDEX idx_items_search ON items
    USING GIN (to_tsvector('english', name || ' ' || coalesce(notes, '')));

-- ============================================================
-- Seed data (based on frontend/src/data/sampleData.js)
-- ============================================================

INSERT INTO categories (name) VALUES
    ('Furniture'),     -- 1
    ('Kitchen'),       -- 2
    ('Bathroom'),      -- 3
    ('Bedroom'),       -- 4
    ('Living room'),   -- 5
    ('Cleaning'),      -- 6
    ('Utilities'),     -- 7
    ('Electronics'),   -- 8
    ('Moving costs'),  -- 9
    ('Other');         -- 10

-- Placeholder hashes: these accounts can't log in until real auth exists.
INSERT INTO users (email, name, password_hash) VALUES
    ('sam@example.com',     'Sam Strickler', 'not-a-real-hash'),  -- 1
    ('caius@example.com',   'Caius Price',   'not-a-real-hash'),  -- 2
    ('qiaozhi@example.com', 'Qiaozhi Yong',  'not-a-real-hash');  -- 3

INSERT INTO moves (name, destination, target_date, created_by) VALUES
    ('Our First Apartment', '123 Main St, Akron, OH', '2026-12-15', 1);

INSERT INTO move_members (move_id, user_id, role, move_in_date) VALUES
    (1, 1, 'owner',  '2026-12-15'),
    (1, 2, 'member', '2026-12-15'),
    (1, 3, 'member', '2026-12-20');

INSERT INTO invitations (move_id, invited_by, invited_email, code, expires_at) VALUES
    (1, 1, 'friend@example.com', 'MOVE-4821', '2026-12-01');

INSERT INTO rooms (move_id, name) VALUES
    (1, 'Living room'),  -- 1
    (1, 'Kitchen'),      -- 2
    (1, 'Bathroom');     -- 3

INSERT INTO products (retailer, title, url) VALUES
    ('IKEA', 'KIVIK Sofa, Tibbleby beige/gray', 'https://www.ikea.com/us/en/p/kivik-sofa-tibbleby-beige-gray-s69440581/');

INSERT INTO product_prices (product_id, fetched_at, price) VALUES
    (1, '2026-10-01 12:00-04', 699.00),
    (1, '2026-10-05 12:00-04', 649.00);

INSERT INTO items (move_id, name, category_id, room_id, est_cost, status, responsible_user_id, added_by) VALUES
    (1, 'Couch',             1, 1,    650.00, 'needed', 2,    2),  -- 1
    (1, 'Shower curtain',    3, 3,     25.00, 'bought', 1,    1),  -- 2
    (1, 'Pots and pans set', 2, 2,    120.00, 'needed', 3,    3),  -- 3
    (1, 'Wi-Fi router',      8, NULL,  90.00, 'bought', 1,    1),  -- 4
    (1, 'Dining table',      1, 2,    300.00, 'needed', NULL, 2);  -- 5

INSERT INTO item_product_options (item_id, product_id) VALUES
    (1, 1);

-- Category budgets for the move ($2,500 total).
INSERT INTO budgets (move_id, category_id, amount) VALUES
    (1, 1, 1200.00),  -- Furniture
    (1, 2,  400.00),  -- Kitchen
    (1, 3,  150.00),  -- Bathroom
    (1, 8,  200.00),  -- Electronics
    (1, 9,  550.00);  -- Moving costs

INSERT INTO expenses (move_id, item_id, category_id, description, amount, paid_by, expense_date) VALUES
    (1, 2,    3, 'Shower curtain',        25.00, 1, '2026-09-20'),  -- 1
    (1, 4,    8, 'Wi-Fi router',          90.00, 1, '2026-09-24'),  -- 2
    (1, NULL, 9, 'Moving truck deposit', 150.00, 3, '2026-09-28');  -- 3

-- Everyone has split_weight 1, so each expense is split evenly three ways.
INSERT INTO expense_splits (expense_id, user_id, amount_owed) VALUES
    (1, 1,  8.34), (1, 2,  8.33), (1, 3,  8.33),
    (2, 1, 30.00), (2, 2, 30.00), (2, 3, 30.00),
    (3, 1, 50.00), (3, 2, 50.00), (3, 3, 50.00);

INSERT INTO ai_conversations (move_id, started_by, title) VALUES
    (1, 2, 'Finding a couch');

INSERT INTO ai_messages (conversation_id, role, content, tool_name, tool_input) VALUES
    (1, 'user',      'Can you find us a couch under $700?', NULL, NULL),
    (1, 'tool',      NULL, 'search_products', '{"query": "sofa", "max_price": 700}'),
    (1, 'assistant', 'I found the IKEA KIVIK sofa for $649 and added it as an option on your Couch item.', NULL, NULL);

INSERT INTO activity (move_id, actor_id, action, entity_type, entity_id, details) VALUES
    (1, 2,    'item_added',       'item',    1, '{"name": "Couch"}'),
    (1, 1,    'expense_logged',   'expense', 1, '{"amount": 25.00}'),
    (1, NULL, 'product_suggested','item',    1, '{"product_id": 1}');
