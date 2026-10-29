# Transitional ClientSQL runtime snapshot

These three TypeScript files are the last ClientSQL output for the existing `AppDb` submission demo. They are checked in verbatim so removing the Python generator and SQLite 3.16 validator does not disable persistence, transactions, subscriptions or the database debug view. No build step regenerates them.

Keep the database namespace, file identity and schema version until the planned Drizzle migration explicitly handles existing installations. Drizzle is not integrated yet. Replace this snapshot with the Drizzle schema/driver/migrations together.

The implementation comes from Snapchat/Valdi's MIT-licensed ClientSQL generator templates; see LICENSE.
