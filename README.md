# MudTronics MFC Energy Setup Tool

Client-only static calculator based on `mfc_charge_time_calculator.xlsx`.

## Run locally

Because the app loads YAML files with `fetch`, serve the folder over HTTP:

```bash
python3 -m http.server 8080
```

Then open <http://localhost:8080/>.

## Deploy on GitHub Pages

This repository is a static site and can be published directly from the repository root.

1. Push the repository to GitHub on `main`.
2. In the repository settings, open **Pages**.
3. Set **Build and deployment** source to **Deploy from a branch**.
4. Select the `main` branch and the `/ (root)` folder.
5. Save the settings.

The app uses relative paths, so it works both on a user page and a project page URL.

## Edit hardware data

- `data/harvesters.yml`: harvester efficiency, quiescent power, input voltage/current limits, storage voltage limit.
- `data/energy_sources.yml`: energy buffer type, technology, storage size, voltage rating, leakage current, ESR.
- `data/converters.yml`: optional post-storage DC-DC output voltage, efficiency, quiescent power, and input limits.

The YAML parser intentionally supports a simple top-level list of key/value objects. Keep the same format when adding entries. Add `datasheet_url` to any hardware entry to render a datasheet link on its card. For energy buffers, use `type` values such as `supercap`, `cap`, or `battery`, and use `technology` for details such as `EDLC`, `Li-ion`, or `LiFePO4`.

## Model notes

The app preserves the spreadsheet logic for MFC array power, harvester efficiency, losses, required storage sizing, charge time, and required MFC count. It adds:

- selected energy buffer capacity checks;
- selected YAML hardware cards;
- optional DC-DC conversion after the energy buffer;
- load-side versus storage-side energy handling when the DC-DC stage is enabled.
