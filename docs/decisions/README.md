# Architecture decision records

Short records of decisions that are costly to reverse, so later sessions know why Synapse is
the way it is. Start each one from the ADR template in `~/.claude/dev_process/templates/adr.md`,
named `NNNN-kebab-case-title.md` and numbered in order. Never delete one: a decision that
changes gets a new record, and the old one becomes "Superseded by NNNN".

| #   | Decision | Status |
| --- | -------- | ------ |
| [0001](0001-self-hosted-nextjs-and-postgresql.md) | Build Synapse as a self-hosted Next.js and PostgreSQL app on the finance-stack pattern | Proposed |
| [0002](0002-graph-as-postgres-tables-with-sigma-and-graphology.md) | Store the graph as typed node and edge tables in PostgreSQL, and render and analyse it with graphology and Sigma.js | Proposed |
