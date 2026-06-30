# Installation-date backfill — 2026-04-20

**Performed:** 2026-06-30  
**Units affected:** 138  
**Value written:** `installation_date = 2026-04-20` (units table)

## Why

These units were imported as already-installed (`status = 'installed'`) but never had an `installation_date`. The owner Progress Report (`/management/reports/progress`) only counts units fully installed **with an installation date inside the selected From–To window**, so these dateless units were excluded and the report under-counted vs. the raw "installed" total. We backfilled a single synthetic date (`2026-04-20`, the import-completion date) so they reconcile.

> ⚠️ **Synthetic date.** True real-world install dates are unknown/earlier. All 138 units share `2026-04-20`, so a future "installs per day" view will spike on that date.

## How to reverse

Set `installation_date` back to `NULL` where `installation_date = '2026-04-20' AND status = 'installed'` (no installed unit carried this date before the backfill), or use the unit IDs below.

## Units affected (grouped by building)

### Delmanor — 15 Summerland Terrace — 13 units · 55 windows

| Unit | Windows | Unit ID |
|------|--------:|---------|
| 201 | 4 | `unit-bcc4ca66` |
| 202 | 4 | `unit-00a8cabf` |
| 204 | 5 | `unit-4a499693` |
| 214 | 4 | `unit-92f797f6` |
| 217 | 4 | `unit-411123f9` |
| 229 | 4 | `unit-62e2254c` |
| 311 | 4 | `unit-1cdfc118` |
| 412 | 2 | `unit-d8662df2` |
| 508 | 5 | `unit-308dc2eb` |
| 807 | 5 | `unit-b84303f0` |
| 901 | 4 | `unit-53c88d3e` |
| 1103 | 6 | `unit-6b53f26a` |
| 1110 | 4 | `unit-eed51cc8` |

### InterRent — Building C — 30 units · 161 windows

| Unit | Windows | Unit ID |
|------|--------:|---------|
| 102 | 5 | `unit-e1992cf3` |
| 103 | 5 | `unit-edf795fc` |
| 105 | 5 | `unit-d7a111ef` |
| 108 | 4 | `unit-c2842b9c` |
| 109 | 5 | `unit-2f7f3388` |
| 112 | 6 | `unit-614385eb` |
| 116 | 5 | `unit-90a35bed` |
| 117 | 5 | `unit-3bd9d915` |
| 301 | 5 | `unit-d95f2ede` |
| 302 | 5 | `unit-05135ed4` |
| 303 | 5 | `unit-2018bb3c` |
| 304 | 5 | `unit-a3620d40` |
| 305 | 5 | `unit-6cbcd27c` |
| 306 | 2 | `unit-7ee06ae7` |
| 308 | 7 | `unit-c096ecf1` |
| 309 | 6 | `unit-382e6508` |
| 401 | 5 | `unit-565f226a` |
| 402 | 5 | `unit-3f3914eb` |
| 403 | 5 | `unit-00ae737c` |
| 404 | 5 | `unit-35f32f5a` |
| 405 | 8 | `unit-3d187a5c` |
| 407 | 5 | `unit-70d8cbc5` |
| 408 | 7 | `unit-1d171a58` |
| 409 | 6 | `unit-bf315b4b` |
| 412 | 6 | `unit-dc119a13` |
| 413 | 2 | `unit-be3a0b70` |
| 606 | 8 | `unit-0a99dfec` |
| 609 | 6 | `unit-48676712` |
| 707 | 5 | `unit-6906d44f` |
| 1010 | 8 | `unit-1ccb4027` |

### InterRent — Lansdowne Building B — 95 units · 611 windows

| Unit | Windows | Unit ID |
|------|--------:|---------|
| 201 | 5 | `unit-2cd0bdc1` |
| 205 | 8 | `unit-9e9e5b05` |
| 207 | 6 | `unit-547bf8f0` |
| 210 | 5 | `unit-05e9544a` |
| 406 | 6 | `unit-1c631053` |
| 409 | 5 | `unit-eacc168e` |
| 501 | 4 | `unit-e6ce480b` |
| 503 | 7 | `unit-6841b7a1` |
| 504 | 7 | `unit-b524fe73` |
| 506 | 5 | `unit-a154e3db` |
| 509 | 5 | `unit-fa281dea` |
| 603 | 7 | `unit-72b3e01a` |
| 609 | 5 | `unit-1f49f6b0` |
| 701 | 4 | `unit-0dce7261` |
| 703 | 7 | `unit-8809d53c` |
| 704 | 7 | `unit-0a015958` |
| 705 | 7 | `unit-c981fd23` |
| 706 | 5 | `unit-571bfc8b` |
| 709 | 5 | `unit-ef05f0c6` |
| 710 | 5 | `unit-0a06db85` |
| 711 | 4 | `unit-27fa7303` |
| 802 | 5 | `unit-29389f5f` |
| 803 | 7 | `unit-2cb21465` |
| 804 | 7 | `unit-1cb54675` |
| 805 | 7 | `unit-378075ec` |
| 806 | 5 | `unit-fee30fc2` |
| 808 | 7 | `unit-502d654b` |
| 809 | 8 | `unit-2865aaf0` |
| 810 | 5 | `unit-b83e5cc8` |
| 1006 | 5 | `unit-8f232e5c` |
| 1008 | 7 | `unit-21642f18` |
| 1102 | 5 | `unit-2ec18b64` |
| 1103 | 7 | `unit-e4bf3154` |
| 1104 | 7 | `unit-ead03425` |
| 1105 | 7 | `unit-b20e3dc7` |
| 1106 | 5 | `unit-c200104e` |
| 1107 | 6 | `unit-9a46eeba` |
| 1108 | 8 | `unit-a535dd82` |
| 1109 | 8 | `unit-98a8bbc2` |
| 1111 | 5 | `unit-6a34f539` |
| 1211 | 4 | `unit-4366ab23` |
| 1302 | 5 | `unit-34a8cf8b` |
| 1303 | 7 | `unit-e3f2ecc6` |
| 1304 | 7 | `unit-e50c175e` |
| 1305 | 7 | `unit-a00d2c49` |
| 1306 | 5 | `unit-ad8dba2f` |
| 1308 | 8 | `unit-6e850123` |
| 1309 | 8 | `unit-efbdc2c1` |
| 1402 | 5 | `unit-f55e1954` |
| 1407 | 6 | `unit-7320fe4b` |
| 1501 | 5 | `unit-dd6860ec` |
| 1510 | 5 | `unit-33fc57f9` |
| 1511 | 5 | `unit-1f326998` |
| 1601 | 5 | `unit-2bbb2fba` |
| 1604 | 8 | `unit-0d0e507c` |
| 1605 | 7 | `unit-237925f8` |
| 1606 | 6 | `unit-687688d3` |
| 1608 | 8 | `unit-56a18f7c` |
| 1609 | 8 | `unit-0da7e24f` |
| 1703 | 8 | `unit-a6484fb0` |
| 1704 | 8 | `unit-62f4432b` |
| 1706 | 6 | `unit-b1dd2a29` |
| 1708 | 8 | `unit-679d4a84` |
| 1709 | 8 | `unit-0cf43a5e` |
| 1803 | 8 | `unit-0260abc8` |
| 1806 | 6 | `unit-ab310cb6` |
| 1808 | 8 | `unit-b975b7b3` |
| 1809 | 8 | `unit-4cf2db4c` |
| 1902 | 5 | `unit-bbf115fb` |
| 1903 | 8 | `unit-01a9e57d` |
| 1905 | 7 | `unit-f6b91d99` |
| 1906 | 6 | `unit-5369f4b1` |
| 1909 | 8 | `unit-f89e39bd` |
| 2010 | 5 | `unit-7e58b2a0` |
| 2102 | 5 | `unit-200a2d9f` |
| 2103 | 8 | `unit-d90ee9a8` |
| 2104 | 8 | `unit-d73f5910` |
| 2201 | 5 | `unit-f415940d` |
| 2202 | 5 | `unit-6f13784a` |
| 2203 | 8 | `unit-100bfe59` |
| 2205 | 7 | `unit-7f924cd9` |
| 2206 | 6 | `unit-37acea24` |
| 2208 | 8 | `unit-765cfe7a` |
| 2209 | 8 | `unit-f49fcab7` |
| 2503 | 8 | `unit-0690665d` |
| 2504 | 8 | `unit-fe5d842e` |
| 2602 | 5 | `unit-480d4f05` |
| 2603 | 8 | `unit-7e288b16` |
| 2605 | 7 | `unit-6c087a46` |
| 2606 | 6 | `unit-1ec106c1` |
| 2608 | 8 | `unit-0c6fe14a` |
| 2609 | 8 | `unit-bd034329` |
| 2702 | 5 | `unit-0fe7a05d` |
| 2706 | 6 | `unit-bfb52e80` |
| 2708 | 8 | `unit-56042f92` |

