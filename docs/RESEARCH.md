# Round 00 research

Research date: 2026-10-25. Sourced facts are in [PRECEDENTS.md](PRECEDENTS.md) and [STANDARDS.md](STANDARDS.md), which are generated from `src/core/data/`. This page is the narrative. Each statement says whether it was **checked** in a source this round or is **recall** (reference knowledge to verify before relying on it).

## 1. MANICA's stadium work

MANICA Architecture is a Kansas City practice founded by David Manica after his time at HOK Sport, where he was a lead designer on projects including Wembley (recall; Wembley credit checked via Wikipedia). Its stadium work falls into four groups.

- **Completed:** Allegiant Stadium (2020, 65,000 expandable to 71,835, translucent ETFE roof, roll-in grass tray, with HNTB), Inter Miami's Freedom Park stadium (opened 4 Apr 2026, about 25,000 seats), the interim Inter Miami stadium in Fort Lauderdale (2020), VTB Arena Park in Moscow (2019, a 26,000-seat stadium with a 14,000-seat arena nested inside it), and the Progressive Field renovation (2024–25). All checked.
- **Under construction or in design:** New Nissan Stadium in Nashville (opening 2027, enclosed ETFE, about 60,000), the Kansas City Chiefs stadium (renderings July 2026, about 70,000, target 2031, with HNTB), the Birmingham City stadium (Heatherwick lead designer, MANICA collaborating architect, 62,000), and Nuovo Stadio Milano with Foster + Partners (71,500, renderings due 29 Oct 2026). All checked.
- **Proposals or unbuilt:** the Chicago Bears stadium in Arlington Heights (2025 renderings, pending approvals), the Cagliari competition win (2018, not built), San Paolo in Naples (concept), and the Tirana competition (2014). All checked.
- **Supporting roles:** at Camp Nou, MANICA joined in 2016 to provide "technical sport design services". The architects are Nikken Sekkei with Pascual i Ausió. Checked.

The common threads for a bowl tool are steep, enclosed, loud bowls that pull fans towards the field (Allegiant, Chiefs, Nissan), translucent roofs, multipurpose fields (trays, movable pitches) and dense premium layering. These shape the Round 02–04 priorities in [ROADMAP.md](ROADMAP.md).

## 2. Corrections to the brief

These were found while checking the brief against sources. The app and the docs follow the sources.

1. **Everton (Hill Dickinson Stadium)** is not a Populous project. The design architect was Dan Meis (MEIS Architects), the delivery architect BDP Pattern and the contractor Laing O'Rourke. Checked (RIBA Journal). It is kept in the library as a precedent for rake: its South Stand is reported at 33.89°.
2. **Camp Nou** is not a MANICA-led design. MANICA's role was technical sport design. Checked.
3. **Tirana:** MANICA and PCMR won the 2014 competition, but the stadium built on the site in 2019 is credited to Archea Associati. The relationship between the two is unverified, so the entry is marked as a competition win.
4. **HOK and Populous** are different firms. HOK Sport became Populous after a 2009 management buyout (recall). The contemporary HOK rebuilt a sports practice and acquired ROSSETTI on 29 Apr 2026, now operating as HOK + ROSSETTI. Checked (Athletic Business press release). Historic "HOK Sport" credits such as Yankee Stadium (2009) belong to Populous's lineage, not today's HOK.
5. **Chicago Bears:** the brief treats this as a design project. As of the last source it was a proposal pending state approval and financing, so it is marked as a proposal.

## 3. Populous, HOK + ROSSETTI and the tools landscape

- **Populous** (Tottenham, Wembley with Foster + Partners, New Highmark Stadium) sets the benchmark for single-tier "walls" of fans (Tottenham's 17,500-seat South Stand) and for retractable or multi-sport fields.
- **HOK** (Mercedes-Benz Stadium, Etihad Park, the EverBank modernisation) together with **ROSSETTI** (Ford Field, the Arthur Ashe work, Daytona Rising).
- **HOK Scrum** is HOK's in-house Grasshopper/Rhino bowl tool. From its public description it covers real-time bowls, sightlines, proximity, rake, row elevations, concession and restroom access, acoustics, event scoring, seat-level revenue and precast rationalisation. HOK says a bowl can be set up in a day. MANICAI has **no access to Scrum's code, methods or data**. The description is used only to understand what professionals expect from such a tool. Checked (HOK article).
- **Rhino + Grasshopper** is where professional bowls are actually built. MANICAI's position is to get to a credible bowl in minutes for anyone, then hand over a clean native `.3dm` with layers, blocks and named seats, so the work continues in Rhino rather than being redrawn.

## 4. Bowl design principles used in Round 01

- **C-value** sightlines with C = D(N+R)/(D+T) − R. FIFA gives 60 mm as the minimum, 90 mm as preferred and 120 mm as optimal. Risers are solved row by row from this formula. Checked (FIFA), formula recall (Green Guide, John & Sheard).
- **Viewing distance:** FIFA recommends 150 m to the far pitch corner as the optimum and 190 m as the maximum. Checked.
- **Rake:** the UK Green Guide caps seated tiers at 34° (recall). MANICAI uses this as the default maximum and caps risers there, flagging rows that then fall short of their C target.
- **Seats and rows:** 500 mm seat width and 800 mm row depth (the Green Guide recommended values, with 460 mm and 700 mm as minimums), and at most 28 seats between aisles (recall). US codes size aisles differently. This is flagged for Round 02.
- **Upper tiers** accept a lower C target (default 60 mm). Holding 90 mm with a 34° cap is not achievable at upper-tier distances; this is a known trade-off in large bowls and the reason most upper tiers sit at 60–70 mm.
- **Corners:** a large corner radius pulls the corner rows close to the field corner and steepens the whole bowl. MANICAI measures this (`plan.corner`) and advises a radius near the first-row distance.

## 5. What the research means for MANICAI

1. The user must always see which numbers are governing, which are guidance and which are MANICAI assumptions. Hence the tagged registry and the "Checks" panel.
2. Precedent presets must be honest: fitted to a published capacity, labelled low-confidence, and never shown as the real building.
3. The bowl is the core. Concourses, vomitories, premium, structure and roof all hang off the tier profiles and the plan ring. Round 01 therefore builds those two as exact, testable primitives (see [ARCHITECTURE.md](ARCHITECTURE.md)).
