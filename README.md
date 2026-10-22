# Check-In Route Analytics — Management Overview & SOP

**Live website:** [Check-In Route Analytics](https://crmsupport-simran.github.io/checkin-route-analytics/)
**Purpose:** Browser-based reporting for sales check-ins, attendance, route review, dealer tour planning, joint-working KPIs, and expected employee travel.

## What this website can do

The application has five report tabs. It works with the reports uploaded in the top upload area and recalculates when those files are replaced.

| Tab | What it is for | Main inputs |
|---|---|---|
| **Dashboard** | Filter check-ins, view employee/date summaries, inspect actual visit order and route distance, compare with an optimized visit order, and export CSV. | Check-In / Check-Out report; Attendance and Dealer Master are optional enrichments. |
| **Tour Plan** | Create a future daily or monthly dealer plan for an employee, inspect the route on a map, approve/lock a plan, compare actual visits to the plan, and export the customer plan. | Dealer Master required; Check-In and Attendance reports add actual-visit/base context. |
| **Check-in Analysis** | Find repeated employee/date/location/type check-in groups for review; filter and export a verification list. | Check-In / Check-Out report. |
| **Joint Working KPI** | Calculate Q1, Q2, and Q3 for a selected calendar month; inspect calculation details and export the KPI table. | Check-In / Check-Out report. |
| **Employee Tour Plan** | Produce a day-wise historical movement report, infer regular/temporary attendance anchors, calculate expected route KM, review route segments and reconcile attendance with check-ins. | Check-In and Attendance reports recommended; Dealer Master can enrich missing visit GPS. |

## Standard operating procedure

1. Open the live website in Chrome or Edge.
2. Upload the **Check-In / Check-Out Excel** file (`.xlsx`, `.xls`, or `.csv`). This is the primary data source for the Dashboard, Check-in Analysis, Joint Working KPI, and check-in portions of Employee Tour Plan.
3. Upload the matching **Attendance Report** for attendance times, GPS, anchor history, and attendance/check-in reconciliation.
4. Upload **Dealer Master** for assigned dealers, future Tour Plan creation, and optional GPS fallback for a check-in that has no check-in/check-out GPS but can be matched to a dealer.
5. Select a report tab. Use its filters to choose month, employee, date, type, manager, or search criteria as available.
6. Use the report's export button to download the relevant CSV. Check the status/notes and Calculation Details before sharing calculated distance or KPI results.

### Refreshing and replacing data

- **↻ Refresh Data** reprocesses the files currently loaded in the open browser session without clearing them.
- To use a newer Excel file, upload that new file; refresh reprocesses the currently selected file, it does not look for changes on disk.
- Uploaded files are held in browser memory. If the browser tab is closed or the page is fully reloaded, upload the files again.
- Tour plans are stored in that browser's local storage. They are not shared automatically with other computers or users.

## Tab details and calculation conditions

### 1. Dashboard

- Filters include date, Sales User, employee ID, Reporting Manager, Type, and free-text search.
- Check-ins are displayed in Check-In time order. The actual route uses each visit's check-in and check-out coordinates when valid.
- The map and route summary distinguish the recorded visit sequence from an optimized suggested sequence. The suggestion is advisory; it does not rewrite the source check-ins.
- Attendance information such as field start/end, working time, and Attendance Google KM appears when a matching Attendance Report has been uploaded. Attendance Google KM is a source value and is separate from route distance calculated from check-in GPS.
- Dealer Master may show assigned dealers and dealer matches; it is optional for the Check-In dashboard.
- Missing/invalid GPS rows stay in the data table and export but cannot contribute usable route points.
- CSV export can cover the selected employee/date, filtered rows, or the full uploaded Check-In report.

### 2. Tour Plan

- **Dealer Master is required.** The employee list and assigned dealer set are based on Dealer Master employee assignments; select the employee by name/ID.
- A daily route is built from assigned dealers with valid GPS, starting from an inferred Attendance base when available. The application groups nearby dealers, chooses a nearby feasible visit sequence, and checks the complete route against the configurable daily travel limit (including the return leg when a base is set).
- A monthly plan allocates unique assigned customers across the selected month's dates, respects any dealer plan dates, and applies the configured per-day visit and travel limits. The calendar shows the planned visit count/status for each date.
- Route distance uses the existing road-routing service where available. A straight-line fallback is labeled as approximate; invalid coordinates are not treated as real locations.
- Plans can be approved and locked. Exports include a tour report, customer-plan CSV, and summary. The monthly customer-plan CSV is designed for the application's import format.
- Actual Check-In data supports plan-vs-actual matching. The match radius is configurable; a match is a location correspondence, not a judgment of employee performance.

### 3. Check-in Analysis

- A duplicate group is defined by the same **date + employee ID + normalized location + normalized Type**. Location uses Check-In Location, then Company Name, then Dealer Channel Partner.
- Case and extra spaces do not create separate groups.
- Status thresholds are: **1 = Normal**, **2–3 = Duplicate Check-in**, **4–5 = High Duplicate Activity**, **6 or more = Very High Duplicate Activity** at the same grouped location/type/date for that employee.
- These statuses identify records for verification. They do **not** automatically mean a check-in is false or improper.
- Date, employee/name, employee ID, location, Type, and status filters are available. The verification CSV exports repeated groups with first/last check-in time.

### 4. Joint Working KPI

The report takes its dates and rows from the currently loaded Check-In report. Months are generated from the data; the latest available month is selected by default. Text comparisons trim spaces, collapse repeated spaces, and ignore case. The four Zonal Manager values below are excluded from Q1, Q2, and Q3:

- SHOBHIT GOEL
- OTHERS
- ARCHIT GARG
- SHANTANU ATTARY

#### Calendar buckets

- WEEK-1: days 1–7
- WEEK-2: days 8–14
- 1-15TH: days 1–15, calculated independently
- WEEK-3: days 16–22
- WEEK-4: days 23 through the selected month's final day
- Second half: day 16 through the selected month's final day

The final day is determined from the selected month and year, so February uses 28/29, 30-day months use 30, and 31-day months include day 31. The 1–15 and second-half totals are independently calculated for their complete date ranges; they are not sums of adjacent week cells.

#### Q1 — Manager-wise Joint Working pivot subtotal

1. **Sales User / Designation** identifies the Manager/Senior. The application's approved Sales User manager designations are GM - SALES, DGM-SALES, AGM-SALES, SR.MANAGER-SALES (9), MANAGER-SALES (including code (4)), DEPUTY MANAGER-SALES (including code (4)), ASSISTANT MANAGER-SALES (including code (4) and NBD variants), SR. ASSISTANT MANAGER-SALES, TERRITORY SALES INCHARGE (including code (4)), TERRITORY SALES MANAGER (including code (4)), and TERRITORY SALES OFFICER (including NBD/code variants).
2. **Joint Working Designation** identifies the Executive/BDO partner. Accepted values are EXECUTIVE-SALES (including code (4)), BUSINESS DEVELOPMENT OFFICER (including code (4)), and SR. EXECUTIVE-SALES (including code (4)).
3. Joint Working must be **YES**, and Joint Working Name must be nonblank.
4. For each Manager and bucket, count each populated **Type** column once, then sum those manager subtotals. This reproduces the supplied pivot's G-column method (October validation subtotal: **32** for 1-15TH). Q1 is therefore the manager-wise pivot subtotal, not a count of raw check-in rows or unique calendar dates.

#### Q2 — Retailer visits with a Senior

Uses the same Manager/Senior designation, Executive/BDO **Joint Working Designation**, Joint Working = YES, and nonblank Joint Working Name conditions as Q1. It counts **all qualifying rows** whose Type is **DEALER** or **OTHER**; repeated qualifying check-ins remain separate rows. The October 1–15 validation target was **102**.

#### Q3 — Unique channel partners visited by Senior

- Sales User / Designation must be one of: DEPUTY MANAGER-SALES (with/without (4)), MANAGER-SALES (with/without (4)), ASSISTANT MANAGER-SALES (including (4) and ASSISTANT MANAGER-SALES (NBD) (4)), AGM-SALES, SR.MANAGER-SALES (9), or DGM-SALES.
- Type must be **CHANNEL PARTNER**.
- Count unique distributor identifiers in each bucket, choosing the first available value: Dealer Channel Partner Code → Dealer Channel Partner → Company Name.
- The October 1–15 validation target was **30**.

Use **View Calculation Details** to inspect qualifying rows, role breakdowns, manager subtotals, exclusions, and unique distributor sets. Export Joint Working KPI downloads the selected month's bucket table.

### 5. Employee Tour Plan

- Creates one row per employee/date found in the union of the uploaded Check-In and Attendance data. The month and employee filters scope the report.
- Attendance start/stop GPS points are clustered when they are within 500 metres. The most repeatedly paired start/stop location is the primary regular anchor; confidence is based on repeated observations. A different location is called a temporary hotel/stay only when it appears as both start and stop on at least two consecutive attendance dates. Other locations are shown as attendance locations; the app does not assume every alternate location is a hotel.
- Anchor confidence is **High** at 5 or more matched start/stop dates or 10 or more observations, **Medium** at 2 or more matched dates or 4 or more observations, and **Low** otherwise.
- For a date, actual Attendance start/stop coordinates are preferred. If an endpoint coordinate is missing, a matching historical anchor may be used and is flagged as inferred. If no reliable anchor/location is available, Expected KM is not calculated.
- Planned Visits is the number of Check-In records for that employee/date. Attendance start and stop events are not visits; source Check-In records are not automatically deduplicated.
- Check-Ins are ordered by recorded Check-In time. When time is unavailable/tied, original source order is retained. The route consists of start anchor → every visit → actual attendance stop anchor.
- Visit location coordinates prefer Check-In GPS, then Check-Out GPS, then a Dealer Master match by Check-In Type ID / dealer account code or an unambiguous company name. Each fallback/missing coordinate is identified in the route status/audit. If any required route point has no usable coordinate, Expected KM is left uncalculated rather than inventing a distance.
- Road KM reuses the existing OSRM routing service and its in-memory route cache. Identical coordinate sequences within the report are grouped so they are not requested repeatedly. If road routing is unavailable, the app uses Haversine straight-line distance and labels it **estimated**. Distances display to two decimal places.
- The selected day includes a detailed sequence/segment audit with location, dealer/company, time, coordinates, next location, segment KM, total KM, and coordinate source. The anchor-history section shows primary anchor counts, start/stop matches, confidence, and detected temporary stays.
- CSV exports are available for the summary and route audit. The report is for movement review; inferred anchors and estimated distances should be checked against source records before operational decisions.

## Data, privacy, and interpretation

- Excel/CSV parsing runs in the browser. Check-In, Attendance, and Dealer Master rows are not uploaded to this website's application backend.
- For route calculations, the browser sends the required coordinates (not employee names, IDs, mobile numbers, or workbook rows) to the existing public OSRM routing endpoint. OpenStreetMap map tiles are also loaded from their tile provider. Use this as a light operational tool; public routing services can be unavailable or rate-limited.
- If OSRM is unavailable, the app labels its Haversine fallback as estimated. Haversine is straight-line distance and is not road distance.
- Results depend on the uploaded file's accuracy, matching Employee IDs, valid dates, timestamps, and GPS. Missing values are surfaced in status/details instead of being silently filled with assumed coordinates.
- The Dashboard, Tour Plan, Check-in Analysis, and KPI are operational aids, not proof of misconduct or a substitute for verifying source data.

## File formats and expected fields

Upload `.xlsx`, `.xls`, or `.csv` files.

**Check-In / Check-Out report:** the parser requires Date, Sales User Name, Emp ID, Check In, Start Latitude, Start Longitude, End Latitude, and End Longitude. Other fields used by reports include Designation, Reporting Manager, Zonal Manager, Type, Type ID, Company Name, Check In Location, Check Out, Check Out Location, Joint Working, Joint Working Name, Joint Working Designation, and Basic Order Value. The parser selects a `CheckIn Report` worksheet when present; otherwise it uses the first worksheet. Fields not supplied by a workbook remain blank and can limit the related analysis.

**Attendance Report:** fields used when available include Name, Employee Code, Designation, Start Time, Stop Time, Start Address, Stop Address, Start Latitude/Longitude, Stop Latitude/Longitude, Google KM, Reporting Manager, Zonal Manager, and Total Working Time.

**Dealer Master:** fields used when available include Company Name/Customer Name, Account Code/Customer Code, Latitude, Longitude, Address, City, Assigned Sales Users, Assigned Channel Partner, Assigned Beat, Plan Date, Mobile, and Last Visit.

## Technical notes

- Static React + Vite application; no application server or database is required.
- The report parser and supplemental attendance/dealer parsers use browser workers for workbook processing.
- Existing Q1/Q2/Q3, Dashboard, Check-in Analysis, and Tour Plan remain separate from the Employee Tour Plan module.
- Local development: `npm install`, then `npm run dev`.
- Production build: `npm run build` (output is generated in `dist/`).
- GitHub Pages deployment is triggered by pushing to the repository's `main` branch.

## Q1–Q3 Reports dashboard

The separate **Q1–Q3 Reports** tab uses the loaded Check-In data and its own designation configuration and calculation service. It does not call the Existing Joint Working KPI calculation. Q1 uses the report's Manager + TSO/TSI/TSM designation group, Joint Working = YES, a named BDO with an approved Executive/BDO Joint Working Designation, and Type = DEALER; each Manager ID + Date contributes one day per bucket. Q2 uses the approved group and joint-working fields and counts qualifying DEALER + OTHER source check-in rows, grouped in the weekly buckets. Q3 uses the separately approved Senior designation list and CHANNEL PARTNER type; a normalized distributor identifier (Dealer Channel Partner Code → Dealer Channel Partner → Company Name) is unique globally within each bucket. All report-designated Zonal Manager exclusions are listed in the dashboard audits.

The existing **Q1–Q3 Reports** tab also contains a **Manager Joint Working Dashboard · Q1 & Q2** section, sharing the page's selected month. This manager-only section is separate in calculation logic from the Manager + TSO/TSI/TSM summary below and from the **Joint Working KPI** tab. Q.1 counts each approved Manager identity once per qualifying date after Joint Working = YES, a nonblank Joint Working Name, and at least one approved Executive/BDO token in Joint Working Designation. Comma-separated cells qualify when any token matches; AGM-SALES and TERRITORY SALES MANAGER only qualify alongside an eligible Executive/BDO token. Q.2 counts unique Channel Partner identifiers per week among the approved Manager-only group, prioritizing Dealer Channel Partner Code → Dealer Channel Partner → Company Name; it does not require Joint Working = YES. The configured Zonal Manager exclusions apply. WEEK-4 ends at the selected month's actual last day. Manager subtotals, inclusion/exclusion audits, CSV downloads, and an Excel workbook use these same Q.1/Q.2 calculations. October reference figures appear only for reconciliation and never replace calculated values.

That dashboard also includes a separate **Q.2 Weekly Unique Distributor Groups** validation against the supplied October 2026 pivot workbook. Its group key is week + normalized Senior Sales User (Emp ID fallback only when the name is blank) + approved designation + normalized Distributor Identifier + Type. The distributor identifier priority is Dealer Channel Partner Code → Dealer Channel Partner → Company Name. Its independent reference designation set includes the ten Manager/Senior roles and five Territory roles listed in the Excel `Designation List`; the existing Manager-only KPI configuration is unchanged. October WEEK-1 and WEEK-2 expected counts are 179 and 232, with a confirmed expected subtotal of 411. WEEK-3/WEEK-4 remain pending until references are supplied. For non-October months, expected values remain pending. The comparison, group listing, and row-level eligibility/duplicate audit are downloadable as CSV or Excel.

Buckets follow calendar month length: WEEK-1 days 1–7; WEEK-2 8–15; FIRST HALF 1–15; WEEK-3 16–23; WEEK-4 24–month end; SECOND HALF 16–month end. Half totals add their weekly results. The dashboard has bucket charts, manager summaries, row-level inclusion/exclusion audits, designation and data-quality audits, Excel workbook and CSV downloads. Historical October totals shown for reconciliation are references only; calculations are sourced from the selected Check-In file.
