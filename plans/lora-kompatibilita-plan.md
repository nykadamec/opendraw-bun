# Plán: Zvýraznění kompatibilních LoRA podle vybraného modelu

> Branch: dle aktuální práce. Bez zásahu do kódu, dokud výzkum nedá zdroj kompatibility.

## Požadavek
- Ve výběru LoRA (configuration panel) zvýraznit LoRA kompatibilní s vybraným modelem.
- Zjistit, zda v ckpt existují metadata pro detekci.

## Známý stav
- DT `.ckpt` nenesou `architecture`/`base_model` klíče (baseModel null u všech 46). Známo: triggery (`krea2*` vs `flux2*`), názvy souborů, sqlite sidecary, CivitAI enrich (vrací baseModel).
## Závěr výzkumu (ses_f8ccd5432ffeNaacbGs7Wm61lF)
- API vrací `baseModel` (local → civitai-hash → civitai-name → civarchive) + `baseModelSource` + triggery. DT ckpt mají `baseModel null` – nutný serverový fallback (trigger prefix `krea2*`/`flux2*` + název) + normalizace bází + mapování verze modelu → povolené báze. Frontend pak jen čte a zvýrazňuje.

- Hotovo celé (2c04832 server + 4bcebfe UI): distribuce 31/15/8 správně, ? badge, striktní filtr, retry. Po restartu serveru zkontrolovat.
