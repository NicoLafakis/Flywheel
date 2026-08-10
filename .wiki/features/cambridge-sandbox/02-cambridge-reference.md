---
covers:
  - "js/voxelscene-*.js"
---
# Cambridge sandbox — the factual reference brief

**Status:** research reference. Nothing here is a design decision, and nothing
here is built.
**Date:** 2026-08-06.
**Scope:** what is actually at and around the building HubSpot leases in
Cambridge, Massachusetts, established from sources, so the level designer builds
the real place instead of a plausible one.

The audience for this scene is people who work in the building. They will not
grade it on block count; they will grade it on whether the thing across the
street from their desk is the thing across the street from their desk. For that
audience a confident guess costs more than an admitted blank, which is why every
factual claim below carries a marker — the marker is how a reader tells what
they can build on without checking, and what still needs a source:

| Marker | Means |
|---|---|
| **Confirmed** | Two or more independent sources agree, or it is a direct geometric measurement from OpenStreetMap. |
| **Likely** | One good source, or two that agree in substance but differ in a number. |
| **Unverified** | Could not be established. Stated as a gap, not filled in. |

An Unverified item is a research task that is still open, so it stays Unverified
until someone closes it with a source. Where sources conflict, both numbers
appear and the conflict is called out rather than quietly resolved — the
designer is better served by seeing the disagreement than by seeing a tidy
number that might be the wrong one.

---

## 0. Which building, settled first

HubSpot has held several Cambridge addresses over fifteen years and has let some
of them go. Getting the hero building wrong is the most expensive mistake
available here, so it is worth settling before anything else. The timeline:

| When | Address | What happened | Confidence |
|---|---|---|---|
| 2010 | 25 First Street ("The Davenport") | HubSpot moves in | Confirmed ([HubSpot](https://www.hubspot.com/company-news/home-sweet-home-hubspot-renews-lease-for-global-headquarters-in-cambridge), [NEREJ](https://nerej.com/jamestown-extends-hubspots-lease-at-the-davenport-to-the-entire-218037-sf-building)) |
| Jan 2016 | 25 First Street | Landlord Jamestown extends the lease across the **entire 218,037 sq ft** building; HubSpot then held 118,561 sq ft on floors 1, 2 and 4 | Confirmed ([NEREJ](https://nerej.com/jamestown-extends-hubspots-lease-at-the-davenport-to-the-entire-218037-sf-building)) |
| ~2017 | 2 Canal Park | Campus expands "across the street" into floors 1-2, 60,002 sq ft, desks for 295 | Confirmed ([HubSpot](https://www.hubspot.com/company-news/hubspot-cambridge-hq-expands-across-the-street)) |
| Sept 2021 | 2 Canal Park | 205,000 sq ft expansion + renewal at Two Canal Park — HubSpot now fills the **whole** building; campus reported at ~445,000 sq ft | Confirmed ([Bisnow](https://www.bisnow.com/boston/news/office/hubspot-doubles-down-office-commitment-at-east-cambridge-hq-110110), [CoStar](https://www.costar.com/article/830096194/hubspot-signs-largest-lease-this-year-in-biotech-hot-spot-outside-boston), [BLDUP](https://www.bldup.com/posts/hubspot-signs-205k-sf-lease-in-cambridge)) |
| Sept 2021 | **1 Canal Park** | Lease **terminated**. Building sold to Breakthrough Properties and converted to biotech lab | Confirmed ([Bisnow](https://www.bisnow.com/boston/news/office/hubspot-doubles-down-office-commitment-at-east-cambridge-hq-110110), [Breakthrough / PRNewswire](https://www.prnewswire.com/news-releases/breakthrough-properties-to-welcome-three-mission-driven-biotech-companies-to-one-canal-development-in-the-heart-of-cambridge-302153015.html)) |
| June 2024 | **64 Sidney Street** | Vacated, $2.8M impairment, subleased Aug 2024 | Confirmed (HubSpot SEC disclosure, via [search of SEC filings](https://www.sec.gov/Archives/edgar/data/1404655/)) |

**1 Canal Park is the easy one to mix up.** It is a four-storey building **40 m
due west** of 2 Canal Park, it is still called "Canal Park", HubSpot was in it,
and HubSpot is not in it any more — it is a life-science building now. If the
sprocket lands on the wrong Canal Park building, the people who moved out of it
will be the first to notice.

**The build target.**

| | |
|---|---|
| **Primary building** | **2 Canal Park, Cambridge, MA 02141** ("Two Canal Park") |
| **HubSpot's occupancy** | The entire building, ~205,000 sq ft (2021 lease) |
| **This is also the corporate HQ address of record** | Listed as HubSpot's Cambridge headquarters address by Apple Maps, Dun & Bradstreet, GlobalData and Clay |
| **Confidence** | **Confirmed** as the HQ address of record and as a HubSpot-occupied building. **Likely** that it is the single "main" building rather than a co-equal half of a two-building campus — see below. |
| **Second building, part of the same campus** | **The Davenport, 25 First Street**, ~130 m WSW across First Street. Reported at ~240,000 sq ft of HubSpot occupancy in 2021. |

**Open conflict, not resolvable from public sources.** Bisnow reports HubSpot at
240K sq ft in 25 First Street, but the building itself is documented at 218,037
sq ft. Both cannot be measured the same way. Separately, HubSpot's own
corporate-entity filings have used *"2nd Floor, 25 First Street"* as a legal
address while its public HQ listings say *2 Canal Park*. **Recommendation:
build both buildings.** They are 130 m apart, they are both real, they are both
HubSpot, and the scene is large enough to hold them. Centering the map on 2
Canal Park and putting the Davenport a block WSW is correct under every reading
of the sources.

**Worth knowing, not worth building.** No public source after 2024 indicates a
Cambridge move, and HubSpot's 2026 investor materials still describe a Cambridge
headquarters ([ir.hubspot.com](https://ir.hubspot.com/)). HubSpot has, though,
publicly consolidated leases and shrunk its footprint elsewhere
([Bisnow](https://www.bisnow.com/national/news/office/hubspot-is-latest-tech-firm-to-spend-millions-on-lease-consolidation-layoffs-117442)),
so it is worth confirming with someone at HubSpot before ship that both
buildings are still occupied. That is a product question about a real place,
answerable by one email, and it costs a lot less than shipping the wrong campus
to a room full of employees.

---

## 1. The HubSpot buildings

### 1.1 Two Canal Park — 2 Canal Park

| Fact | Value | Confidence |
|---|---|---|
| Coordinates | 42.37014 N, -71.07631 W | Confirmed (Nominatim / OSM) |
| Footprint | **104 m × 71 m** (OSM building outline bounding box) | Confirmed (measured) |
| Storeys | **5** | Confirmed (OSM `building:levels=5`; [Boston Office Spaces](https://www.bostonofficespaces.com/properties/2-canal-park/) agrees) |
| Height | **~22 m** (5 × ~4.3 m floor-to-floor, office) | Likely — derived, not sourced |
| Rentable area | 206,569 sq ft | Likely (one source) |
| Built / renovated | **1987**, gut-renovated **2015** (modern atrium, new lobby) | Likely — conflicts with a second source saying built 1999, 4 storeys, 200,000 sq ft. OSM's 5 levels backs the 1987/5-storey reading. |
| Facade | *"Traditional cast stone and water-struck brick facade counterpointed by a modern glass and steel entry court"* | Confirmed (repeated verbatim across listings) |
| Setting | Fronts the historic Lechmere Canal on the east side | Confirmed |
| Parking | Covered on-site, ratio 0.9; 5 elevators | Likely |
| Interior features from HubSpot's own announcement | Event space with bleacher seating, industrial kitchen, ping-pong room, indoor beer garden, private outdoor patio, barista café | Confirmed ([HubSpot](https://www.hubspot.com/company-news/hubspot-cambridge-hq-expands-across-the-street)) |
| Exterior HubSpot signage — where it is, how big, whether the sprocket is on the roof, the parapet, or only at the door | — | **Unverified.** No reliable public description exists; a street-level photo closes it. This is the single most-looked-at detail in the scene, so it is worth closing before authoring rather than after. |

**Massing in four shapes.** A wide, low, flat-topped brick slab — roughly one
and a half times as long as it is deep — with a lighter cast-stone base band and
cornice band, and a glass-and-steel entry court punched into the canal-facing
side. It is a broad building, not a tall one: at 104 × 71 × 22 m it is wider
than it is high by a factor of nearly five, so it reads as a slab rather than a
tower.

### 1.2 The Davenport — 25 First Street

| Fact | Value | Confidence |
|---|---|---|
| Position | ~130 m WSW of 2 Canal Park (offset E −123 m, N −40 m) | Confirmed (measured) |
| Building name | **The Davenport** | Confirmed |
| Origin | 1860s brick furniture factory — the A. H. Davenport / Irving & Casson works, birthplace of the "davenport" sofa. On the National Register. | Confirmed ([History Cambridge](https://historycambridge.org/articles/furniture-making-in-east-cambridge-birthplace-of-the-davenport-sofa-in-americas-gilded-age/), [NEREJ](https://nerej.com/jamestown-extends-hubspots-lease-at-the-davenport-to-the-entire-218037-sf-building)) |
| Structure | **Seven adjoining brick-and-beam mill buildings**, combined into one office complex in a 1987 renovation, redesigned by Sasaki in 2008, $18M lobby/common-area renovation under Jamestown | Confirmed |
| Address span | 108–134 Cambridge Street **and** 25 First Street — i.e. it occupies most of a city block | Confirmed ([History Cambridge](https://historycambridge.org/articles/furniture-making-in-east-cambridge-birthplace-of-the-davenport-sofa-in-americas-gilded-age/)) |
| Area | 218,037 sq ft | Confirmed |
| Storeys | Mixed, **4 to 7** across the constituent buildings (OSM records 4, 6 and 7 on adjacent parcels of the block) | Likely |
| Footprint | Block roughly **110 m × 65 m**, irregular | Likely — measured from OSM parcels, but OSM does not carry the Davenport under that name, so the block edges are inferred from the address range |
| Prior tenants | Interleaf, Zipcar, Sonos, HubSpot | Confirmed |

**Massing in four shapes.** Not one building — a *ragged row* of red-brick mill
blocks of slightly different heights and rooflines, sharing party walls, with
tall regularly-spaced industrial window openings, flat roofs, and a stepped
skyline where the pieces meet. The visual signature is the height jog between
adjoining sections. A single clean box loses the whole character.

A gift for the voxel vocabulary: the Davenport is exactly the case
`01-voxel-primitive-vocabulary.md` is arguing for. A long brick mill wall is one
solid piece with punched openings rather than a field of same-size cubes, and
the two documents end up pointing at the same building.

---

## 2. The immediate surroundings — a few blocks in every direction

### 2.1 The street grid

East Cambridge is a **rotated Manhattan grid**, and the rotation is small and
measurable. Axis bearings, computed from OSM way geometry within 500 m of the
HubSpot building (**Confirmed**, measured):

| Street | Axis bearing from true north | Role |
|---|---|---|
| First Street, Second Street | **9.8°** | the "north–south" spine; First Street separates the two HubSpot buildings |
| Third Street | 15.6° | |
| Cambridge Street | **99.7°** | the "east–west" main street; the neighbourhood's commercial spine |
| Otis Street, Thorndike Street, Bent Street, Rogers Street | 99.4°–100.0° | the cross streets |
| Edwin H. Land Boulevard | 35.7° | the diagonal along the river / CambridgeSide |
| North First Street | 33.3° | runs under the Lechmere viaduct |
| Monsignor O'Brien Highway (Route 28) | 124.7° | the big NW–SE diagonal, cuts the grid |

So: **rotate the whole street grid ~10° clockwise from cardinal**, and lay two
diagonals across it — Land Boulevard toward the river, O'Brien Highway toward
the bridges. That single rotation is most of what makes the layout read as East
Cambridge rather than as Anywhere, USA.

Named streets inside a 600 m radius (**Confirmed**, OSM): Austin, Bent, Binney,
Cambridge Parkway, Cambridge, CambridgeSide Place, Canal Park, Charles, Charles
River Dam Road, Child, East, Edwin H. Land Boulevard, Fifth, First, Glassworks
Avenue, Gore, Hurley, Leighton, Monsignor O'Brien Highway, Museum Way, North
First, Otis, Rogers, Sciarappa, Science Park, Second, Spring, Third, Thorndike,
Water, Winter.

### 2.2 Water

| Feature | Where | Notes | Confidence |
|---|---|---|---|
| **Lechmere Canal** | E +137, N −170 from HubSpot | A short dead-end canal basin with a circular pool and a fountain, cut inland from the Charles. It is the reason 2 Canal Park exists and is named that. HubSpot's building fronts it. | Confirmed |
| **Lechmere Canal Park** | E +60, N −122 | The landscaped park wrapping the canal basin | Confirmed |
| **Charles River** | ~400–550 m south/southeast | The lower basin, downstream of the Longfellow | Confirmed |
| **Charles River Dam & locks** | Upper Lock Gatehouse E +538, N −450; Lower Lock Gatehouse E +604, N −368 | Two small gatehouse structures; the dam is what the Museum of Science sits on | Confirmed (OSM) |
| **Charlesgate Yacht Club** | E +193, N −386 | Small boathouse on the Cambridge Parkway shore | Confirmed (OSM) |
| **MDC Boathouse** | E +248, N −196 | | Confirmed (OSM) |

### 2.3 Transit — and a correction to a common assumption

**The Red Line is not the local line here.** The nearest Red Line station,
Kendall/MIT, is **1,156 m southwest** — a fifteen-minute walk, not a local stop.

The station HubSpot employees actually use is **Lechmere, on the Green Line**,
**127 m due north** of the building. **Confirmed.**

| Fact | Value | Confidence |
|---|---|---|
| Address | 3 North First Street | Confirmed |
| Opened | 21 March 2022, as part of the Green Line Extension | Confirmed ([Wikipedia](https://en.wikipedia.org/wiki/Lechmere_station), [MBTA](https://www.mbta.com/projects/green-line-extension-glx)) |
| Form | **Elevated** station on a viaduct — the old ground-level station was demolished and rebuilt in the air | Confirmed |
| Platform | Single **curved island platform**, 108 m long, 10–11 m wide, over the block between East Street and North First Street | Confirmed |
| Adjacent | Lechmere Busway; the MBTA Green Line Transportation Office (E −337, N +604) and the Michael Capuano Inner Belt Carhouse (E −132, N +689) | Confirmed (OSM) |

Green Line trains are **green-and-white light rail**, running on an elevated
concrete-and-steel viaduct that curves over the street. That viaduct is a
strong, cheap, unmistakably-local silhouette element sitting 130 m from the
hero building. Red Line cars (silver with a red stripe) belong on the
**Longfellow Bridge**, ~950 m south, not here.

### 2.4 Neighbouring buildings, measured

Everything below is **Confirmed** — position and storey count read directly from
OSM building outlines, offsets computed against the HubSpot building. Storey
counts are OSM's `building:levels` where present.

| Building | Storeys | Offset E / N (m) | Note |
|---|---|---|---|
| 1 Canal Park | 4 | −40 / −7 | Ex-HubSpot, now biotech lab — it carries no HubSpot branding. |
| 10 Canal Park | 5 | +84 / −176 | |
| 40 Thorndike Street (ex-Sullivan Courthouse) | **22** in OSM, **20** in the developer's press | −272 / −95 | See §3. Footprint 86 × 57 m. |
| Middlesex South Registry of Deeds | — | −247 / +50 | 89 × 50 m, civic masonry |
| Middlesex County Courthouse (the old one, 41 Second St) | — | −280 / −22 | 32 × 49 m |
| First Street Garage | — | −152 / −125 | 123 × 75 m — a big blank-walled parking deck |
| The Glass Factory (condos) | 8 | −117 / +191 | Name is a genuine East Cambridge glassworks reference |
| Sierra (apartments) | 8 | +111 / +115 | |
| Thomas Graves Landing | 8 | +141 / −92 | On the canal |
| Zinc Apartments | 15 | −195 / +313 | |
| Hampton Inn Boston/Cambridge | 7 | −191 / +239 | |
| Fairfield Inn and Suites | 5 | −288 / +304 | |
| East Cambridge Savings Bank | 2 | −378 / +88 | Small, old, civic; a neighbourhood fixture |
| Third Congregational Church | — | −335 / −36 | |
| Archstone Northpoint (apartments) | **22** | +264 / −21 | Tall slab immediately east |
| Twenty\|20 at Cambridge Crossing | **20** | +375 / +156 | |
| AVA East / AVA West | 6 / 6 | +177 / +24, +106 / +69 | |
| Avalon North Point Lofts | 6 | +290 / +17 | |
| Tango (apartments) | 12 | +214 / +94 | |
| Hult House (dormitory) | 12 | +468 / +93 | |
| Education First HQ | 12 | +622 / −35 | Distinctive glassy HQ at North Point |
| The Royal Sonesta Boston | 11 | +98 / −397 | Riverside hotel |
| 55 Cambridge Parkway | 9 | +26 / −488 | |
| Rivercourt Condos | 15 | −100 / −521 | |
| Athenæum Press Building | 4 (17.4 m) | −243 / −649 | Old brick press building; the only OSM height tag in range |
| American Twine Office Park | 3 | −328 / −342 | Another converted mill |
| Chang Shing Tofu Factory | 1 | −238 / −433 | Genuinely there. Genuinely a tofu factory. |
| Lofts at Kendall Square | 5 | −569 / −437 | |
| Museum of Science Parking Garage | 4 | +310 / −204 | |

**Reading of the skyline.** The hero building is one of the *shortest* things in
its own neighbourhood. Within 400 m there are three 20-plus-storey towers
(40 Thorndike west, Archstone Northpoint east, Twenty|20 northeast). HubSpot's
five-storey brick slab sits in a bowl between them. That is the honest silhouette
and it is more interesting than a hero tower would be — the scene reads as
*a low brick block in a ring of new glass*, which is exactly what East Cambridge
is right now.

### 2.5 Parks and plazas within 600 m

**Confirmed** (OSM): Lechmere Canal Park (+60 / −122), Charles Park (−3 / −417),
Front Park (−17 / −560), Cambridge Parkway park strip (+29 / −524), Binney
Street Park (−136 / −603), Centanni Park (−252 / −16), Silva Park (−413 / +66),
Costa Lopez Park (−314 / −251), Timothy J. Toomey, Jr. Park (−366 / −399),
Viaduct Courts (+310 / −73), The Common at CX (+217 / +157), Science Park
(+416 / −291), Richard McKinnon State Park / North Point Park (+591 / −136).

Two of those names — **Costa Lopez** and **Silva** — are Portuguese, which is
the neighbourhood telling you what it is. See §4.

### 2.6 CambridgeSide

**352 m due south** of the HubSpot building. **Confirmed.**

Formerly the CambridgeSide Galleria mall; now mid-redevelopment into a
six-building, ~2 million sq ft mixed campus of retail, lab, office, residential
and hotel. **Confirmed** ([Boston
Globe](https://www.bostonglobe.com/2024/06/30/business/cambridgeside-mall-redevelopment/),
[New England Development](https://nedevelopment.com/projects/20-cambridgeside/)).

- **20 CambridgeSide** — 10 storeys, ~366,000 sq ft office/lab, on the corner of
  Edwin H. Land Boulevard and CambridgeSide Place, where a multi-storey Macy's
  used to be. **Confirmed.**
- **100 CambridgeSide** — ~224,000 sq ft of lab in the former Sears. **Confirmed.**
- Retail still operates on the lower levels. **Likely.**

**Designer's note.** Anyone who worked in this building before ~2020 remembers
CambridgeSide as *a mall with a food court and a canal-side atrium*. Anyone who
started after remembers it as *lab buildings*. Both memories are in the room at
UNBOUND. Depicting it as a big glassy podium block with retail at the base and
lab floors above is true to now, and a small nod to the mall era (see §4) costs
nothing.

---

## 3. Landmarks, ranked by recognizability

Ranked by how instantly a Cambridge or Boston person names it from a silhouette.
Offsets are metres from 2 Canal Park, computed from confirmed coordinates.

### Tier 1 — build these, they carry the scene

**1. MIT Great Dome (Building 10) and Killian Court** — 1,706 m SW.
Confidence: position **Likely** (the Great Dome's exact centroid was approximated
from campus geometry; Killian Court is **Confirmed** at 1,778 m SW). Height:
150 ft / **46 m** to the top, dome diameter 100 ft / **30.5 m** — **Confirmed**
([MIT News](https://news.mit.edu/2013/great-dome-reborn-oculus-0215)).
*Four shapes:* a wide limestone-grey classical block, a colonnade of tall
columns across its front, a shallow hemispherical dome with an oculus, and a
big open rectangle of lawn (Killian Court) running from its base to the river.
The dome is low and broad, not tall and pointed — get that ratio wrong and it
reads as a capitol building.

**2. Ray and Maria Stata Center** — 1,519 m SW. **Confirmed** position
(42.36154, -71.09067). Frank Gehry, two towers (Gates, 9 storeys; Dreyfoos,
7 storeys), ~720,000 sq ft. Height **Unverified** — no reliable figure found;
estimate ~40 m from storey count.
*Four shapes:* leaning brushed-metal cylinders and wedges that look like they
are falling over, mismatched orange and yellow brick volumes at the base, a
crumpled silver tower with no vertical line in it, all sitting on a normal city
block. **This is the single best voxel target in the region** — its whole
identity is a small number of bold tilted masses, which is precisely what a
low-block-count voxel vocabulary is good at. It will read from a hundred metres.

**3. Longfellow Bridge, the "salt-and-pepper shakers"** — Cambridge end 952 m S,
Boston end 992 m SSE. **Confirmed** ([Wikipedia](https://en.wikipedia.org/wiki/Longfellow_Bridge),
[MassDOT](https://blog.mass.gov/transportation/massdot-highway/longfellow-bridge-salt-and-pepper-towers-work/)).
1,768 ft / **539 m** long, opened 1906, **11 steel arch spans on masonry piers**,
**four carved granite towers on the two central piers** — the towers are the
nickname, they look like tabletop salt and pepper shakers, and they carry carved
Viking ship prows. The **Red Line runs down the middle**, between the two
roadways.
*Four shapes:* a long low line of steel arches, two fat granite piers at
mid-river, four stubby domed granite towers standing on them in pairs, and a
silver-and-red train crossing between them. If exactly one bridge makes the
map, make it this one.

**4. Museum of Science** — 524 m SE. **Confirmed** (42.36743, -71.07110).
Sits **on the Charles River Dam**, spanning the river with a foot in Boston and
a foot in Cambridge; two wings meeting at the Charles River gallery; OSM records
4 levels. **Confirmed** that it is the departure point for the amphibious Boston
Duck Tours.
*Four shapes:* a long horizontal white/pale slab lying *across* the water rather
than beside it, a low bridge deck continuing the line, a squat planetarium drum,
and a car park deck (which is really there, 310 / −204). It is the closest true
landmark to the HubSpot building and it is unmissable from the neighbourhood.

**5. Lechmere station and its viaduct** — 127 m N. **Confirmed.** Covered in
§2.3. It is Tier 1 not because tourists know it but because *everyone in the
building* does. An elevated curved platform with a green train on it, one block
from your desk, is the detail that makes the audience believe the rest.

### Tier 2 — strongly recognizable, in comfortable range

**6. Leonard P. Zakim Bunker Hill Memorial Bridge** — 1,111 m E. **Confirmed**
([Wikipedia](https://en.wikipedia.org/wiki/Leonard_P._Zakim_Bunker_Hill_Memorial_Bridge)).
**270 ft / 82 m inverted-Y towers**, 1,457 ft / 444 m long, 745 ft / 227 m main
span, opened 2003, widest cable-stayed bridge in the world, ten lanes.
*Four shapes:* two white inverted-Y masts, two fans of cables, a wide flat deck
threading *through the legs* of the towers, and a river underneath. The
inverted-Y was designed to echo the Bunker Hill Monument — same silhouette
family, so the two read as a pair when both are on the map.

**7. TD Garden** — 1,239 m ESE. **Confirmed.** A big blank drum/box over North
Station. Recognizable mostly by *where it is* (right at the Zakim's foot) rather
than by shape.

**8. Bunker Hill Monument** — 1,453 m ENE. **Confirmed** position. A **221 ft /
67 m granite obelisk** on a hilltop (height figure: **Likely**, widely cited,
not re-verified here). *Two shapes:* a tapering grey stone needle and a square
green hill. Cheap to build, high recognition, and it pairs with the Zakim.

**9. 40 Thorndike Street (the former Edward J. Sullivan Courthouse)** — 288 m
WSW, footprint 86 × 57 m. **Confirmed** it exists and was redeveloped;
**conflicting** on height: OSM says 22 levels, the developer's own release says
**20 storeys, 422,000 sq ft of office over 48 apartments on levels 2–3, retail
at grade** ([Leggat McCall](https://www.lmp.com/cambridges-40-thorndike-redevelopment-unveiled/)).
Use 20 and note the conflict. Originally a **Brutalist concrete courthouse and
jail**, vacant for years, a long-running local saga, re-clad and reopened 2024.
*Three shapes:* a tall rectangular slab, a strong vertical rhythm of narrow
window bays, and a wider base. It is the tallest thing in East Cambridge proper
and it is 288 m from HubSpot's front door — locals will look for it.

**10. CambridgeSide** — 352 m S. Covered in §2.6.

### Tier 3 — in range, worth including if the map reaches

| Landmark | Offset E / N (m) | Distance | Shape in three | Confidence |
|---|---|---|---|---|
| MIT Green Building (Bldg 54) — **tallest building in Cambridge**, 277 ft / 84 m architectural, 295 ft / 90 m to tip, 21 floors, I.M. Pei | −1,072 / −1,092 | 1,530 m SW | narrow concrete slab, open pilotis at the base, radar dome on the roof | Confirmed (position, height) |
| Kendall/MIT Red Line station | −774 / −858 | 1,156 m SW | plaza, headhouse, glass office blocks around it | Confirmed |
| One Memorial Drive (Microsoft NERD) | −456 / −933 | 1,039 m SSW | glass block on the Cambridge riverbank | Confirmed |
| MIT Media Lab | −904 / −1,060 | 1,393 m SW | white-and-glass cube grid | Likely (position approximate) |
| Novartis / the old **NECCO building**, 250 Mass Ave | −1,791 / −1,006 | 2,054 m WSW | long brick factory, **rooftop water tower** — once painted as a roll of NECCO wafers, now carrying a **DNA double helix** | Confirmed ([MIT Tech Review](https://www.technologyreview.com/2015/08/18/10816/the-past-and-future-of-kendall-square/)) |
| Citgo sign, Kenmore Square | ≈ −1,578 / −2,372 | ≈ 2,849 m SSW | red triangle in a white square, on a roof | Position **Unverified** (approximated). Visibility from East Cambridge: **Unverified** — it is famously visible from the river basin *upstream* of the Longfellow; whether it clears the skyline from Canal Park is not established, so a "you can see it from the office" beat needs that checked first. |
| North Point Park / Richard McKinnon State Park | +591 / −136 | 598 m ESE | green wedge between the river and the rail yard, with a curving footbridge | Confirmed |
| Charles River Dam locks (two gatehouses) | +538 / −450 and +604 / −368 | ~600–700 m SE | two small hip-roofed masonry sheds flanking a lock channel | Confirmed |
| Community College (Orange Line) station | +485 / +424 | ~640 m NE | elevated platform | Confirmed (OSM) |
| Boston Sand & Gravel plant | near the Zakim's Boston foot | ~1,100 m E | grey silos and conveyor gantries, a working industrial site right under a landmark bridge | Position **Unverified** (could not geocode); existence and location relative to the Zakim: Likely |

### Explicitly out of range

The Boston skyline proper (Financial District, Back Bay, the Hancock and
Prudential towers) is 3–5 km away. It belongs in the **backdrop plane**, not in
the buildable map — a low-detail silhouette on the southeast horizon. Fenway
Park, the Freedom Trail, Harvard Yard and Harvard Square are all well outside
any plausible radius; including them would be the "generic Boston" move this
scene is explicitly trying not to make.

---

## 4. Local texture and easter-egg seed material

Aim wide; the designer picks. Confidence is marked because some of these are
neighbourhood lore rather than documented fact.

**On the distances in this section.** Where a prose entry below gives a distance,
it is the straight-line radius from 2 Canal Park and it agrees with §6's `Dist`
column. Several of them originally quoted the **east component alone** (|E| from
§6's table) instead — the tofu factory as "240 m southwest" against a real 494,
the Portuguese parks as "300 m" against 402 and 418, the Glass Factory as "117 m
WNW" against 224. That is one transcription habit rather than three separate
errors, and it matters because a designer reading a prose distance is deciding
which side of `03` §1.2's 340 m ring seam a feature falls on: at |E| all three
read Ring A and at their true radii all three are Ring B. **§6's table is the
authority for any distance; the prose is a description.**

### East Cambridge, specifically

- **The Portuguese neighbourhood.** East Cambridge has had a Portuguese and
  Azorean community since after the Civil War, expanded heavily after the 1958
  Azorean Refugee Act. **St. Anthony's Church still holds Portuguese-language
  masses.** Cambridge Street from Lechmere toward Inman carries **Casa Portugal
  (since 1976)**, **Courthouse Seafood** and **New Deal Fish Market** — the two
  oldest fish markets in the city — plus Portuguese bakeries. **Confirmed**
  ([Boston Magazine](https://www.bostonmagazine.com/property/east-cambridge-neighborhood-guide/),
  [History Cambridge](https://historycambridge.org/history-hubs/culinary-history-hub/)).
  Two parks 402 m and 418 m from HubSpot are named **Costa Lopez** and **Silva**.
  This is the most under-used, most genuinely local seam in the whole map — a
  fish market and a bakery on Cambridge Street say "East Cambridge" far louder
  than another glass lab block does.
- **Triple-deckers.** The residential fabric west and north of the grid is
  three-storey wood-frame triple-deckers with flat or shallow roofs and stacked
  porches. **Confirmed** as the neighbourhood's historic housing type.
- **The glass and furniture industries.** The New England Glass Company and the
  Davenport furniture works were the neighbourhood's industry. Surviving traces:
  **Glassworks Avenue** (a real street, 400 m out) and **The Glass Factory**
  condos (224 m NNW). **Confirmed** (OSM + History Cambridge).
- **The tofu factory.** Chang Shing Tofu Factory, a one-storey industrial
  building 494 m southwest, still operating in a district of lab towers.
  **Confirmed** (OSM). This is the kind of detail that makes a local laugh.
- **The courthouse saga.** 40 Thorndike sat empty and contested for a decade;
  in 2025 contractors who broke environmental law clearing it were still paying
  into a state fund. **Confirmed** ([Cambridge Day](https://www.cambridgeday.com/2025/01/27/contractors-who-broke-laws-clearing-courthouse-are-paying-into-an-environmental-fund-state-says/)).
  Anyone who has worked in the neighbourhood five years has an opinion about
  that building.

### Kendall Square tech history

All **Confirmed** via [MIT Technology Review](https://www.technologyreview.com/2015/08/18/10816/the-past-and-future-of-kendall-square/)
and [MIT News](https://news.mit.edu/2013/kendall-square-birthplace-of-biotech-0319):

- **Draper Laboratory** built the Apollo guidance computer; it moved to Tech
  Square in 1976.
- **Lotus Development** — founded 1982 by Mitch Kapor, bought by IBM for $3.5B
  in 1995 — was at **161 First Street**, a 1907 building **on the same street as
  HubSpot**, about 400 m north. The spreadsheet industry started on First Street.
  That is a real, local, load-bearing piece of software history sitting inside
  the map radius.
- **Biogen** into a Binney Street warehouse in 1983; the **Whitehead Institute**
  1984; **Genzyme** 1990; **Novartis** into the old NECCO factory in 2003.
- The **NECCO water tower** — once painted as a roll of candy wafers, now a
  **DNA double helix**. A perfect two-shape voxel prop with a punchline.
- HubSpot itself was founded out of MIT by Brian Halligan and Dharmesh Shah —
  HubSpot's own lease announcement calls Cambridge *"our home since Brian and
  Dharmesh founded the company out of MIT"* (**Confirmed**). The line from
  Killian Court to 2 Canal Park is, literally, the company's own story, and it
  is 1.8 km long. If the map spans both, it spans that.

### MIT hacks

**Confirmed** via the [IHTFP Hack Gallery](https://hacks.mit.edu/Hacks/by_location/great_dome.html)
and [Boston Globe](https://www.bostonglobe.com/metro/2019/04/30/take-look-back-some-best-known-mit-hacks/k30RAAgUlWzPVkCAmVTzWJ/story.html).
Things that have appeared **on top of the Great Dome**:

- A **campus police cruiser** (1994) with flashing lights, a dummy officer,
  a box of donuts, a parking ticket, and the plate **IHTFP**.
- A **fire truck**.
- A half-scale **Apollo Lunar Module** (40th anniversary of the landing).
- A replica **MBTA Red Line car**.
- A **Wright Flyer** replica (centenary of powered flight).
- A **plastic cow** from the Hilltop Steakhouse.

Other traditions: the **annual piano drop** from the roof of Baker House; the
Caltech cannon stolen and installed outside the Green Building.

**Design read.** A single object sitting on the Great Dome is a *free* easter
egg with enormous local recognition, and the tradition means almost any object
is period-correct. The police car is the canonical one.

### The river and the season

- The **sailing basin** — the dinghy fleet everyone pictures — is **upstream of
  the Longfellow**, between the Longfellow and Harvard Bridges, home to
  Community Boating (founded 1946, "Sailing for All"), the MIT Sailing Pavilion
  (1936, birthplace of collegiate sailing) and the Harvard Sailing Center.
  **Confirmed** ([CRAB](http://www.charlesriverallianceofboaters.org/sailing.html)).
  **In front of East Cambridge you are downstream of that** — the water off
  Cambridge Parkway carries rowing shells, Duck Boats, and lock traffic more
  than a white sailboat fleet. A sailboat scatter is not wrong, but it is
  slightly displaced; if accuracy matters more than the postcard, put the
  dinghies south of the Longfellow and the Duck Boats at the Museum of Science.
- **Boston Duck Tours** launch into the river **at the Museum of Science**,
  524 m from HubSpot. **Confirmed.** An amphibious tour vehicle rolling down a
  ramp into the water is a strong, cheap, unmistakably-Boston moving prop, and
  it belongs exactly where the map already reaches.
- **Head of the Charles Regatta**, every October. **Confirmed.** Runs upstream
  of this map, but a scatter of rowing eights is period-correct for autumn.
- **Canada geese on the riverbank lawns** — universally observed local fact,
  **Unverified** as a citation. Nobody will fact-check a goose. The Cambridge
  Parkway and North Point Park lawns are the right place for them.
- **Dunkin' density.** Greater Boston's Dunkin' saturation is a running local
  joke. Specific store locations within this radius: **Unverified**. Treat the
  density as the joke rather than any one storefront, and see §7 on branding.

### Grid and light trivia

- Because the cross streets run at **99.7°** — under ten degrees off due east —
  the neighbourhood gets its own small "Cambridgehenge": around the equinoxes,
  sunrise and sunset line up close to straight down Cambridge, Otis and
  Thorndike Streets. **Likely** — derived from the measured bearings, not
  independently sourced, but the geometry is sound and the effect is a free,
  correct excuse for a dramatic low-sun lighting preset.

---

## 5. Colours and light

### 5.1 The material palette

This is the material inventory of the district, not a set of hex values. Sample
real photographs before authoring, and follow `conventions.md`'s two palette
rules: **separate the eras by chroma, not by value**, and mark every measured
value with `mm()` / `sp()` / bare-hex provenance.

| Family | Where it is | Chroma note |
|---|---|---|
| **Mill brick — red to red-brown** | The Davenport, the Athenæum Press, American Twine, the triple-deckers, 2 Canal Park's own water-struck brick | The dominant material of the whole district. **High chroma.** Per the chroma rule this is what separates 19th-century East Cambridge from 21st-century East Cambridge, and it does so on saturation, not lightness — de-veiled brick reads *lighter* than expected. |
| **Cast stone / precast — warm off-white to pale grey** | 2 Canal Park's base and cornice bands, civic buildings, the Registry of Deeds | **Low chroma.** |
| **Curtain-wall glass — blue-green to grey-green, dark mullions** | 20 CambridgeSide, Cambridge Crossing, Education First, the lab conversions, 40 Thorndike's new skin | **Very low chroma.** Specular — this is `sp()` territory: leave measured glass values raw, per conventions. |
| **Granite — cool mid grey** | Longfellow Bridge towers and piers, Bunker Hill Monument, older civic bases | Low chroma, high value. |
| **Concrete — grey, weathered** | The Green Line viaduct, the First Street Garage, the Museum of Science garage, the dam and locks | Low chroma. |
| **Limestone — pale warm grey** | MIT's Great Dome and the Killian Court buildings | Low chroma. |
| **Brushed / anodized metal — silver, no colour** | Stata Center, the Zakim's masts and cables (white) | Effectively zero chroma. Stata is the exception: its base carries **orange and yellow brick**, high chroma, deliberately clashing. |
| **The Charles** | The whole southern edge | **Not blue.** Slate-grey to steel-blue-green, brown-green in low light, near-black under cloud. It mirrors sky more than it holds colour. `sp()`. |
| **Park green** | Lechmere Canal Park, North Point Park, Killian Court, Charles Park | Mid-chroma; Killian Court is a notably saturated managed lawn. |
| **Transit accents** | Green Line trains green-and-white; Red Line silver with a red stripe; MBTA bus yellow-and-grey | Small areas, very high chroma. High value per pixel. |

**The one-sentence summary:** *red brick and grey water, cut by low-chroma glass
towers, with the transit and the Stata Center supplying almost all the
saturation in the frame.*

### 5.2 Two times of day

**Mid-morning (roughly 9–10am, the commute).** The sun is low in the **east** —
over Boston, over the Zakim, over the Museum of Science. From HubSpot's front
door those landmarks are **backlit**: the Zakim's masts and the Museum's long
slab go to near-silhouette against a bright sky, and the river throws a hard
specular glare straight back at the viewer. Meanwhile the brick facing east —
2 Canal Park's canal frontage, the Davenport's First Street wall — takes direct
low sun and goes *hot*: the brick is at its most saturated, the mortar lines
read hardest, and shadows run long down the ~10°-rotated cross streets toward
the west. The canal basin is in shadow behind the buildings. This is the
"arriving at work" light.

**Late afternoon / golden hour (the one to ship).** The sun is in the **west**,
behind MIT and Kendall. Now the relationship inverts: the Great Dome, the Green
Building and the Stata Center are rim-lit silhouettes on the southwest horizon,
and everything facing HubSpot — the **east** faces of the Davenport and 2 Canal
Park, the west face of Archstone Northpoint, the Museum of Science, the Zakim's
white masts — takes warm direct light. The Charles goes from grey to bronze.
The 40 Thorndike slab throws a single very long shadow east across the grid.
Around the equinoxes this is the Cambridgehenge alignment (§4), so the light
runs *straight down* Cambridge, Otis and Thorndike Streets rather than across
them, which is both accurate and dramatic.

**If only one light is authored, author the second one.** It puts warm light on
the hero building's most-photographed face, silhouettes MIT (the origin story)
on one horizon and the Zakim (the city) on the other, and it is the light the
neighbourhood is prettiest in.

---

## 6. Scale and layout table

**Origin: 2 Canal Park, 42.3701415 N, −71.0763080 W. +E is east, +N is north.
The street grid is rotated ~10° clockwise from these axes** (§2.1) — the
designer can either author in true north and rotate the grid, or author in grid
axes and rotate the landmarks. Do one, not both.

**Method, stated once so every number can be re-derived or challenged:**

1. Positions are geocoded latitude/longitude from OpenStreetMap Nominatim, or
   the centroid of an OSM building outline.
2. Offsets are a local flat-earth projection at latitude 42.37: **1° latitude =
   111,132 m**, **1° longitude = 82,238 m** (= 111,320 × cos 42.37°). Error over
   a 3 km radius is well under 1%, far below authoring tolerance.
3. Footprints are the **bounding box** of the OSM building outline — so for a
   non-rectangular building the box is an over-estimate. Marked *(bbox)*.
4. Heights carry a source where one exists. Where none does, they are
   **`storeys × 4.3 m`** for office/residential and **`storeys × 3.5 m`** for
   older mill buildings, and are marked *(est.)* so an estimate is never mistaken
   for a measurement.

| # | Feature | Footprint (m) | Height (m) | Offset E | Offset N | Dist | Dir | Confidence |
|---|---|---|---|---|---|---|---|---|
| 1 | **2 Canal Park (HubSpot)** | 104 × 71 (bbox) | ~22 (est., 5 storeys) | 0 | 0 | 0 | — | Position, footprint, storeys: Confirmed. Height: est. |
| 2 | **The Davenport, 25 First St (HubSpot)** | ~110 × 65 (est.) | ~14–25 (est., 4–7 storeys, stepped) | −123 | −40 | 129 | WSW | Position: Confirmed. Footprint and heights: Likely/est. |
| 3 | 1 Canal Park (**not** HubSpot) | 56 × 67 (bbox) | ~17 (est., 4 storeys) | −40 | −7 | 41 | W | Confirmed |
| 4 | Lechmere station + viaduct | platform 108 × 11 | ~9–12 rail level (est.) | +13 | +127 | 127 | N | Platform dims: Confirmed. Rail height: est. |
| 5 | Lechmere Canal + basin | ~140 × 90 water (est.) | water level ~0 | +137 | −170 | 219 | SE | Position: Confirmed. Extent: est. |
| 6 | 40 Thorndike (ex-courthouse) | 86 × 57 (bbox) | ~86 (est., 20 storeys) | −272 | −95 | 288 | WSW | Position/footprint: Confirmed. Storeys: **conflict, 20 vs 22.** |
| 7 | First Street Garage | 123 × 75 (bbox) | ~20 (est.) | −152 | −125 | 197 | SW | Position/footprint: Confirmed. Height: est. |
| 8 | Archstone Northpoint | — | ~95 (est., 22 storeys) | +264 | −21 | 265 | E | Storeys: Confirmed (OSM) |
| 9 | Twenty\|20 at Cambridge Crossing | — | ~86 (est., 20 storeys) | +375 | +156 | 406 | ENE | Storeys: Confirmed (OSM) |
| 10 | CambridgeSide (20 CambridgeSide corner) | ~120 × 90 (est.) | ~43 (est., 10 storeys) | −14 | −352 | 352 | S | Position: Confirmed. Storeys: Confirmed. Footprint: est. |
| 11 | Royal Sonesta Boston | — | ~47 (est., 11 storeys) | +98 | −397 | 409 | SSE | Storeys: Confirmed (OSM) |
| 12 | **Museum of Science** | ~250 × 60 (est., spans the dam) | ~25 (est., 4 levels) | +428 | −301 | 524 | SE | Position: Confirmed. Dimensions: est. |
| 13 | Charles River Dam / Craigie Bridge | ~200 long (est.) | deck ~6 (est.) | +594 | −332 | 680 | ESE | Position: Confirmed |
| 14 | North Point Park | ~300 × 150 (est.) | ground | +591 | −136 | 606 | ESE | Position: Confirmed |
| 15 | **Longfellow Bridge** | 539 long × ~32 wide | towers ~18 above deck (est.); deck ~9 above water (est.) | −84 / +222 (both ends) | −949 / −967 | ~950–990 | S–SSE | Length: Confirmed. Tower height: **est., unverified** |
| 16 | **Zakim Bridge** | 444 long × ~55 wide | masts **82** above deck | +1,098 | −172 | 1,111 | E | Length, width, mast height: Confirmed |
| 17 | Kendall/MIT station + plaza | ~80 × 60 (est.) | headhouse ~6 (est.) | −774 | −858 | 1,156 | SW | Position: Confirmed |
| 18 | TD Garden | ~200 × 150 (est.) | ~45 (est.) | +1,163 | −427 | 1,239 | ESE | Position: Confirmed. Dimensions: est. |
| 19 | Bunker Hill Monument | ~9 × 9 base (est.) | **67** (221 ft) | +1,278 | +690 | 1,453 | ENE | Position: Confirmed. Height: Likely |
| 20 | **Stata Center** | ~130 × 110 (est.) | ~40 (est., 7–9 storeys) | −1,181 | −956 | 1,519 | SW | Position: Confirmed. Dimensions: **est., unverified** |
| 21 | MIT Green Building | ~35 × 20 (est.) | **84** (277 ft arch.) / 90 to tip | −1,072 | −1,092 | 1,530 | SW | Position, height: Confirmed |
| 22 | **MIT Great Dome (Bldg 10)** | dome ø **30.5**; block ~120 × 40 (est.) | **46** to the top of the dome | −1,290 | −1,116 | 1,706 | SW | Height and dome diameter: Confirmed. Position: Likely (approx). |
| 23 | Killian Court | ~180 × 130 lawn (est.) | ground | −1,249 | −1,265 | 1,778 | SW | Position: Confirmed |
| 24 | Novartis / old NECCO + water tower | ~150 × 80 (est.) | ~30 building, tower +12 (est.) | −1,791 | −1,006 | 2,054 | WSW | Position: Confirmed. Dimensions: est. |
| 25 | Citgo sign | sign ~18 × 18 (est.) | rooftop, ~30 above street (est.) | ≈ −1,578 | ≈ −2,372 | ≈ 2,849 | SSW | **Unverified position and visibility.** Backdrop-only at best. |

**What this implies about map size.** Everything in Tier 1 fits inside a
**~1.8 km radius**; everything in Tier 2 fits inside **~1.5 km**. A square map
of roughly **2.5 × 2.5 km centred on 2 Canal Park** — or an asymmetric rect
running further southwest toward MIT than northwest — captures the entire
Tier 1 + Tier 2 set plus most of Tier 3, with only the Citgo sign and the
Boston skyline left for the backdrop plane. Compare: Lower Manhattan is
124 × 118 m and Upper Manhattan's diagonal is 297 m, so a literal 1:1 Cambridge
at that density is not on the table. Whichever compression factor is chosen,
apply it uniformly and record it in the scene file — the offsets above are the
only thing that lets anyone check the layout later, and they only work as a
check if the factor that scaled them is written down.

---

## 7. Sensitivities

Short section, no moralizing. The repo already ships a partner-logo tool, so
branded content is established practice here. These are the items that deserve
a second look before they ship, and where the line sits.

**Fine, and already the point.**

- **HubSpot's own name, sprocket and orange.** The scene is a gift to HubSpot's
  audience, made for a HubSpot event. Use the mark. Use it well and use it
  correctly — a wrong-shade, wrong-proportion sprocket on the hero building is a
  worse outcome than no sprocket. Get the current brand asset rather than
  redrawing it.
- **Building names that are public identity.** "The Davenport", "CambridgeSide",
  "Lechmere", "Museum of Science", "TD Garden", "Bunker Hill Monument",
  "Longfellow Bridge", "Zakim Bridge", the MIT buildings. These are place names
  before they are marks.
- **MIT hacks.** The Institute's own alumni association runs a hack gallery and
  a hack tournament. Putting a police car on the Great Dome is participating in
  a tradition MIT publicly celebrates.

**Check before shipping.**

- **Third-party corporate logos** — Novartis, Biogen, Google, Microsoft, EF,
  Sonos, IBM/Lotus, the CambridgeSide tenants. Depicting a real building is one
  thing; reproducing a live trademark on it is another, and none of these
  companies is the customer here. **Recommendation: build the buildings, skip
  the wordmarks.** Their massing is what makes them recognizable anyway, and a
  blank sign band reads as "a sign" at voxel resolution.
- **Retail and restaurant names.** Casa Portugal, Courthouse Seafood, New Deal
  Fish Market, 1369 Coffee House, the Druid, Dunkin'. These are small local
  businesses and the affection is genuine, but they did not ask to be in a game.
  **Recommendation: evoke, do not name** — a fish market with a fish on the
  awning, a Portuguese bakery, a coffee shop, an orange-and-pink coffee cup. The
  joke lands without the trademark, and for Dunkin' specifically the joke *is*
  the density, not any one store.
- **Competitor branding.** Depicting a rival CRM's office in a HubSpot-audience
  game reads as a jab whether or not one is intended, which is a reason to leave
  it out.

**Handle with care.**

- **Private residences.** A large share of the buildings in §2.4 are people's
  homes — the triple-deckers, the condos, the apartment towers. Building them as
  generic massing is right; individually detailing a specific house, or naming
  it, is not.
- **The former courthouse and jail at 40 Thorndike.** It was a jail. It has a
  long, contested, still-litigated local history. Build the building; skip the
  jokes about it.
- **St. Anthony's Church** and other active places of worship. Depict them
  respectfully or leave them out; either is fine, a destruction set-piece beat
  built around one is not.
- **Destruction framing generally.** This is a game where a hole eats a city, and
  the city this time is one that people work in, and one that includes a
  hospital-adjacent civic district and a river with a dam holding back water. The
  existing scenes have carried this fine because the tone is playful and
  cartoon-physical rather than catastrophic, and that is where Cambridge wants to
  sit too — recognisably a game, not a disaster depiction of a real
  neighbourhood.
- **The Charles River itself.** The dam and locks are flood-control
  infrastructure. Collapsing them is a different kind of image from collapsing an
  office block. Probably fine at this tone; worth one deliberate look.

---

## 8. Known gaps

These are the open research items, collected in one place so that silence in the
sections above is never mistaken for confirmation. Each one is closable with a
source or a photograph.

| Gap | Why it matters |
|---|---|
| HubSpot's exterior signage on 2 Canal Park — placement, size, whether the sprocket appears at roof, parapet or door level | The most-looked-at single detail in the scene |
| Whether HubSpot still occupies **both** buildings as of 2026 | Determines whether the Davenport carries branding or is just a neighbour |
| 2 Canal Park: 1987/5-storey/206,569 sq ft vs 1999/4-storey/200,000 sq ft | Changes the building's height by ~4 m |
| 40 Thorndike: 20 vs 22 storeys | Changes the tallest local landmark by ~9 m |
| The Davenport's exact block outline and per-section heights | OSM does not carry it by name; the parcels were inferred from the 108–134 Cambridge St / 25 First St address range |
| Stata Center height | No reliable figure found; the estimate is from storey count only |
| Citgo sign position and whether it is visible from East Cambridge | Determines whether it is a backdrop element or nothing |
| Boston Sand & Gravel plant coordinates | Could not geocode |
| Longfellow tower height above deck | Estimated only |
| Specific Dunkin' locations in radius | Not established; treat as ambience, not a mapped building |

---

## Sources

- [HubSpot — Home Sweet Home, HubSpot Renews Lease for Global Headquarters in Cambridge](https://www.hubspot.com/company-news/home-sweet-home-hubspot-renews-lease-for-global-headquarters-in-cambridge)
- [HubSpot — Cambridge HQ Expands Across the Street](https://www.hubspot.com/company-news/hubspot-cambridge-hq-expands-across-the-street)
- [HubSpot Investor Relations](https://ir.hubspot.com/)
- [NEREJ — Jamestown extends HubSpot's lease at the Davenport to the entire 218,037 s/f building](https://nerej.com/jamestown-extends-hubspots-lease-at-the-davenport-to-the-entire-218037-sf-building)
- [Bisnow — HubSpot Doubles Down Office Commitment At East Cambridge HQ](https://www.bisnow.com/boston/news/office/hubspot-doubles-down-office-commitment-at-east-cambridge-hq-110110)
- [Bisnow — HubSpot To Spend Up To $100M Consolidating Leases, Reducing Workforce](https://www.bisnow.com/national/news/office/hubspot-is-latest-tech-firm-to-spend-millions-on-lease-consolidation-layoffs-117442)
- [CoStar — HubSpot Signs Largest Lease This Year in Biotech Hot Spot Outside Boston](https://www.costar.com/article/830096194/hubspot-signs-largest-lease-this-year-in-biotech-hot-spot-outside-boston)
- [BLDUP — HubSpot Signs 205K SF Lease in Cambridge](https://www.bldup.com/posts/hubspot-signs-205k-sf-lease-in-cambridge)
- [Savills / T3 Advisors — lease extension at 2 Canal Park](https://www.savills.co.uk/insight-and-opinion/savills-news/318351-0/t3-advisors-represents-hubspot-in-lease-extension-at-2-canal-park-in-cambridge)
- [Boston Office Spaces — 2 Canal Park](https://www.bostonofficespaces.com/properties/2-canal-park/)
- [BLDUP — Two Canal Park](https://www.bldup.com/projects/two-canal-park)
- [PRNewswire — Breakthrough Properties, One Canal, Cambridge](https://www.prnewswire.com/news-releases/breakthrough-properties-to-welcome-three-mission-driven-biotech-companies-to-one-canal-development-in-the-heart-of-cambridge-302153015.html)
- [History Cambridge — Furniture making in East Cambridge](https://historycambridge.org/articles/furniture-making-in-east-cambridge-birthplace-of-the-davenport-sofa-in-americas-gilded-age/)
- [History Cambridge — Culinary History Hub](https://historycambridge.org/history-hubs/culinary-history-hub/)
- [Boston Magazine — Neighborhood Guide: East Cambridge](https://www.bostonmagazine.com/property/east-cambridge-neighborhood-guide/)
- [Cambridge Day — courthouse clearing / environmental fund](https://www.cambridgeday.com/2025/01/27/contractors-who-broke-laws-clearing-courthouse-are-paying-into-an-environmental-fund-state-says/)
- [Leggat McCall — Cambridge's 40 Thorndike Redevelopment Unveiled](https://www.lmp.com/cambridges-40-thorndike-redevelopment-unveiled/)
- [Boston Globe — CambridgeSide unveils its new look](https://www.bostonglobe.com/2024/06/30/business/cambridgeside-mall-redevelopment/)
- [New England Development — 20 CambridgeSide](https://nedevelopment.com/projects/20-cambridgeside/)
- [Wikipedia — Lechmere station](https://en.wikipedia.org/wiki/Lechmere_station)
- [MBTA — Green Line Extension](https://www.mbta.com/projects/green-line-extension-glx)
- [Wikipedia — Longfellow Bridge](https://en.wikipedia.org/wiki/Longfellow_Bridge)
- [MassDOT — Longfellow Bridge "Salt and Pepper" Towers Work](https://blog.mass.gov/transportation/massdot-highway/longfellow-bridge-salt-and-pepper-towers-work/)
- [Wikipedia — Leonard P. Zakim Bunker Hill Memorial Bridge](https://en.wikipedia.org/wiki/Leonard_P._Zakim_Bunker_Hill_Memorial_Bridge)
- [Wikipedia — Green Building (MIT)](https://en.wikipedia.org/wiki/Green_Building_(MIT))
- [MIT News — Great Dome is reborn](https://news.mit.edu/2013/great-dome-reborn-oculus-0215)
- [IHTFP Hack Gallery — Hacks on the Great Dome](https://hacks.mit.edu/Hacks/by_location/great_dome.html)
- [Boston Globe — best-known MIT hacks](https://www.bostonglobe.com/metro/2019/04/30/take-look-back-some-best-known-mit-hacks/k30RAAgUlWzPVkCAmVTzWJ/story.html)
- [MIT Technology Review — The Past and Future of Kendall Square](https://www.technologyreview.com/2015/08/18/10816/the-past-and-future-of-kendall-square/)
- [MIT News — Birthplace of biotech](https://news.mit.edu/2013/kendall-square-birthplace-of-biotech-0319)
- [Charles River Alliance of Boaters — Sailing](http://www.charlesriverallianceofboaters.org/sailing.html)
- [Boston Duck Tours — Museum of Science departure](https://bostonducktours.com/the-tour/departure-locations/museum-of-science/)
- [OpenStreetMap](https://www.openstreetmap.org/) via the Nominatim and Overpass APIs — all building outlines, storey counts, street bearings and computed offsets. Data © OpenStreetMap contributors, ODbL.
