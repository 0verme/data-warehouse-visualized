-- PostgreSQL 15+. Run setup once in a fresh session.
-- TEMP tables disappear on disconnect; no existing permanent tables are changed.
CREATE TEMP TABLE customer (
    customer_sk bigint GENERATED ALWAYS AS IDENTITY (START WITH 1001) PRIMARY KEY,
    customer_id text NOT NULL,
    level text,
    branch text,
    effective_from date NOT NULL,
    effective_to date NOT NULL DEFAULT DATE '9999-12-31',
    is_current boolean NOT NULL DEFAULT true,
    UNIQUE (customer_id, effective_from),
    CHECK (effective_from < effective_to),
    CHECK (is_current = (effective_to = DATE '9999-12-31'))
);

CREATE UNIQUE INDEX customer_one_current
    ON customer (customer_id) WHERE is_current;

-- Initial history: one version of the Banking Teaching Domain's Customer.
INSERT INTO customer (customer_id, level, branch, effective_from)
VALUES ('C-100', 'Standard', 'Austin', DATE '2025-01-01');

-- One incoming row per customer per batch; effective_from is a business date.
CREATE TEMP TABLE customer_stage (
    customer_id text PRIMARY KEY,
    level text,
    branch text,
    effective_from date NOT NULL CHECK (effective_from < DATE '9999-12-31')
);

INSERT INTO customer_stage (customer_id, level, branch, effective_from)
VALUES ('C-100', 'Premium', 'Denver', DATE '2026-03-01');
