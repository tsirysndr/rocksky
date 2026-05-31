# Examples

Runnable scripts that exercise the SDK end-to-end. Run from `sdk/ruby`:

```bash
bundle install
bundle exec ruby examples/01_profile.rb alice.bsky.social
```

| File | What it shows |
|------|---------------|
| `00_setup.rb` | Building a client; reading config from env. |
| `01_profile.rb` | Fetching a profile and recent scrobbles. |
| `02_scrobble.rb` | Submitting a scrobble (needs `ROCKSKY_TOKEN`). |
| `03_charts.rb` | Top artists and tracks for a date window. |
| `04_search.rb` | Free-text search. |
| `05_pagination.rb` | Walking a paginated result set. |
| `06_error_handling.rb` | Error classes the SDK raises. |

Endpoints that require authentication will raise `Rocksky::Unauthorized`
without a token. Set one with:

```bash
export ROCKSKY_TOKEN=...
```

You can also point the SDK at a non-production host:

```bash
export ROCKSKY_BASE_URL=https://api.staging.rocksky.app
```
