---
covers:
  - "js/citycatalog.js"
---
# 02 — Global Roster & Acts: 29 Metropolises

## Master Roster Table

| # | Scene ID | City & Metro | Act & Title | Status | Scale (Blocks) | Difficulty | Landmark Heroes | Accent | Icon |
|:---:|---|---|---|:---:|:---:|---|---|:---:|:---:|
| **0** | `gallery` | **The Lab (Proving Ground)** | **Prologue** · Calibration | **PLAYABLE** | 13,652 | T1 · STARTER | Crash Ramps, Calibration Pylons, Subway Terminal | `#00f0ff` | 🧪 |
| **1** | `sydney` | **Sydney Harbour** (Australia) | **Act I** · Pacific Awakening | **PLAYABLE** | 14,120 | T2 · CASUAL | Opera House Sail Vaults, Harbour Bridge Arch, Sydney Tower | `#4cc9f0` | 🦘 |
| **2** | `auckland` | **Auckland** (New Zealand) | **Act I** · Pacific Awakening | *DEV* | ~16,000 | T2 · CASual | Sky Tower Spire, Waitematā Ferry Wharves, Volcanic Hills | `#48cae4` | ⛵ |
| **3** | `singapore` | **Singapore Marina Bay** | **Act I** · Pacific Awakening | *DEV* | ~22,000 | T3 · NORMAL | Marina Bay Sands, Supertree Grove, Fullerton Hotel | `#00b4d8` | 🦁 |
| **4** | `hongkong` | **Hong Kong** (Victoria Harbour) | **Act II** · Asian Megacities | *DEV* | ~28,000 | T3 · NORMAL | Bank of China Tower, Peak Tram, Star Ferry Terminals | `#ff5d8f` | 🚢 |
| **5** | `seoul` | **Seoul** (South Korea) | **Act II** · Asian Megacities | *DEV* | ~32,000 | T4 · SKILLED | N Seoul Tower, Han River Bridges, Gyeongbokgung Gate | `#ff758f` | 🏯 |
| **6** | `tokyo` | **Tokyo Shinjuku & Shibuya** | **Act II** · Asian Megacities | **PLAYABLE** | 84,122 | T8 · APEX | Shibuya Scramble, Tokyo Tower, Shinjuku Neon Canyons | `#ff0054` | 🗼 |
| **7** | `beijing` | **Beijing** (China) | **Act II** · Asian Megacities | *DEV* | ~38,000 | T4 · SKILLED | Bird's Nest Lattice, CCTV Loop Tower, Imperial Red Walls | `#d90429` | 🐉 |
| **8** | `bangkok` | **Bangkok** (Thailand) | **Act II** · Asian Megacities | *DEV* | ~30,000 | T3 · NORMAL | Wat Arun Spire, Chao Phraya Barges, Tuk-Tuk Markets | `#ffb703` | 🛺 |
| **9** | `mumbai` | **Mumbai** (India) | **Act II** · Asian Megacities | *DEV* | ~34,000 | T4 · SKILLED | Gateway of India, Marine Drive Coastline, Victoria Terminus | `#fb8500` | 🚂 |
| **10** | `dubai` | **Dubai** (UAE) | **Act III** · Desert & Antiquity | *DEV* | ~36,000 | T4 · SKILLED | Burj Khalifa Pinnacle, Palm Monorail, Sail Hotel | `#e0aaff` | 🏜️ |
| **11** | `cairo` | **Cairo** (Egypt) | **Act III** · Desert & Antiquity | *DEV* | ~32,000 | T4 · SKILLED | Giza Limestone Pyramids, Nile Felucca Docks, Citadel Minarets | `#c77dff` | 🐪 |
| **12** | `athens` | **Athens** (Greece) | **Act III** · Desert & Antiquity | *DEV* | ~26,000 | T3 · NORMAL | Acropolis Parthenon, Plaka Stairs, Piraeus Port | `#9d4edd` | 🏛️ |
| **13** | `rome` | **Rome** (Italy) | **Act III** · Desert & Antiquity | *DEV* | ~35,000 | T4 · SKILLED | Colosseum Oval, St. Peter's Dome, Roman Aqueducts | `#7b2cbf` | 🏺 |
| **14** | `paris` | **Paris** (France) | **Act IV** · European Grandeur | *DEV* | ~42,000 | T5 · EXPERT | Eiffel Tower Lattice, Arc de Triomphe, Seine Stone Bridges | `#5a189a` | 🥐 |
| **15** | `london` | **London** (United Kingdom) | **Act IV** · European Grandeur | *DEV* | ~45,000 | T5 · EXPERT | Big Ben Clock Tower, Tower Bridge, The Shard, London Eye | `#3c096c` | 💂 |
| **16** | `amsterdam` | **Amsterdam** (Netherlands) | **Act IV** · European Grandeur | *DEV* | ~28,000 | T3 · NORMAL | Canal Ring Bridges, Gable Townhouses, Windmills | `#240046` | 🚲 |
| **17** | `berlin` | **Berlin** (Germany) | **Act IV** · European Grandeur | *DEV* | ~36,000 | T4 · SKILLED | Brandenburg Gate, Fernsehturm Sphere, Reichstag Dome | `#10002b` | 🐻 |
| **18** | `rio` | **Rio de Janeiro** (Brazil) | **Act V** · The Americas | *DEV* | ~38,000 | T4 · SKILLED | Sugarloaf Cable Cars, Christ Redeemer Peak, Copacabana | `#52b788` | 🌴 |
| **19** | `buenosaires` | **Buenos Aires** (Argentina) | **Act V** · The Americas | *DEV* | ~34,000 | T4 · SKILLED | Avenida 9 de Julio, Obelisco Plaza, La Boca Zinc Mansions | `#74c69d` | 💃 |
| **20** | `mexicocity` | **Mexico City** (Mexico) | **Act V** · The Americas | *DEV* | ~36,000 | T4 · SKILLED | Angel of Independence, Zócalo Cathedral, Reforma Towers | `#95d5b2` | 🌮 |
| **21** | `sanfrancisco` | **San Francisco** (California) | **Act V** · The Americas | *DEV* | ~44,000 | T5 · EXPERT | Golden Gate Bridge, Cable Cars, Transamerica Pyramid | `#e76f51` | 🌁 |
| **22** | `chicago` | **Chicago Loop** (Illinois) | **Act V** · The Americas | **PLAYABLE** | 44,578 | T5 · EXPERT | Willis Tower, Elevated 'L' Runaway Trains, River Bridges | `#ff2a2a` | 🌆 |
| **23** | `toronto` | **Toronto** (Canada) | **Act V** · The Americas | *DEV* | ~40,000 | T5 · EXPERT | CN Tower Pod, Rogers Centre Dome, Streetcar Lines | `#f4a261` | 🍁 |
| **24** | `manhattan` | **Lower Manhattan** (New York) | **Act VI** · New York Trilogy | **PLAYABLE** | 25,875 | T3 · NORMAL | Wall Street Canyons, Trinity Church, Financial Towers | `#ffd23f` | 🏙️ |
| **25** | `brooklyn` | **Brooklyn** (New York) | **Act VI** · New York Trilogy | **PLAYABLE** | 39,984 | T4 · SKILLED | DUMBO Warehouses, East River Piers, Coney Coasters | `#ff9f1c` | 🌉 |
| **26** | `upper-manhattan` | **Upper Manhattan** (New York) | **Act VI** · New York Trilogy | **PLAYABLE** | 73,393 | T6 · MASTER | Central Park Perimeter, Grand Museums, Brownstone Avenues | `#06d6a0` | 🌳 |
| **27** | `boston` | **Boston Seaport** (Massachusetts) | **Act VII** · Tech Corridor | **PLAYABLE** | 82,894 | T7 · TITAN | BCEC Convention Hall, Seaport Boulevard, Harbor Piers | `#3a86ff` | ⚓ |
| **28** | `cambridge` | **Cambridge · UNBOUND Summit** | **Act VII** · Grand Finale | **PLAYABLE** | 72,943 | T9 · SUMMIT | 2 Canal Park (HubSpot Global HQ), Kendall Square, Sprocket Mark | `#9d4edd` | 🚀 |

---

## Act Distribution Summary

* **Act I: The Pacific Awakening** (4 Metropolises — The Lab, Sydney, Auckland, Singapore)
* **Act II: Asian Megacities & High-Density Grids** (6 Metropolises — Hong Kong, Seoul, Tokyo, Beijing, Bangkok, Mumbai)
* **Act III: Desert Horizons & Mediterranean Antiquity** (4 Metropolises — Dubai, Cairo, Athens, Rome)
* **Act IV: European Capitals of Grandeur** (4 Metropolises — Paris, London, Amsterdam, Berlin)
* **Act V: The Americas & Transcontinental Transit** (6 Metropolises — Rio, Buenos Aires, Mexico City, San Francisco, Chicago, Toronto)
* **Act VI: The New York Megacity Trilogy** (3 Metropolises — Lower Manhattan, Brooklyn, Upper Manhattan)
* **Act VII: The Massachusetts Tech Corridor & Grand Finale** (2 Metropolises — Boston Seaport, Cambridge UNBOUND Summit)
