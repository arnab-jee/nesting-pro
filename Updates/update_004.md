# Update 004

Let's build on progressively. Our core system is somewhat ready. Let's work on data persistance and storage.

#### Storage

Certain data like Stock boards needs to be stored, as you have noticed
```
One related gap worth flagging while I was in this code: parts whose (material, thickness) doesn't match any board in the stock list aren't placed or added to unplaced — they're silently skipped, since the outer loop only ever iterates parts matching a board's material/thickness. This can't happen with the sample data (stock is auto-derived to cover every material/thickness present), but it could happen if someone manually removes a stock board row that still has matching parts. Not something I fixed (out of scope for this request), but worth knowing about.
```

Want to implement data persistance. What kind of database should we implement:
- SQLite
- MySQL
- Postgres

What data I want to store right now?
- tenant
- users
- stock boards
- Available optimizations for [Manual(Panel Saw), Nanxing, or other machines(if any)]
- Waste Placement defaults
- For confirm columns, the schema should be named and editable. Currently [Nesting Machine, Panel Saw]. I should be renamed to `Template-1` and `Template`. Default it to `Template-1`.

Let us discuss and you ask me relevant questions before start updating the code.