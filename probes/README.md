# Probes

Pages that measure what the TV can do. Results are in [`docs/CHROMIUM56.md`](../docs/CHROMIUM56.md).
Both report every step with `POST <Lampac>/tvctl/report?dev=…` — the `EX.TvCtl` module of
[lampac-extra](https://github.com/TrueNihilisme/lampac-extra); read them with `GET /tvctl/log`.

- **`server-page/`** — put it into Lampac's `wwwroot/custom/glint-test/` and open it inside the Lampa widget
  with the tvctl command `{"cmd":"goto","url":"/custom/glint-test/index.html"}`. It goes back with `history.back()`.
- **`widget/`** — the same tests from the files of a widget. Set `LAMPAC` in `index.html` to your Lampac
  address, zip the three files into a `.wgt` and install it:
  `apps2samsung-cli install glint-probe.wgt --tv <TV ip> --launch`. It closes itself when done.

Both play a public test stream (`test-streams.mux.dev`) for the player tests.
