from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.enum.section import WD_SECTION
from pathlib import Path

out = Path(__file__).resolve().parent / 'docs' / 'Check-In_Route_Analytics_Dashboard_SOP.docx'
doc = Document()
sec = doc.sections[0]
sec.top_margin = Inches(.68); sec.bottom_margin = Inches(.65); sec.left_margin = Inches(.78); sec.right_margin = Inches(.78)
sec.header_distance = Inches(.3); sec.footer_distance = Inches(.35)
styles = doc.styles
title_ppr=styles['Title']._element.get_or_add_pPr()
title_border=title_ppr.find(qn('w:pBdr'))
if title_border is not None: title_ppr.remove(title_border)
styles['Normal'].font.name='Aptos'; styles['Normal'].font.size=Pt(9.5); styles['Normal'].font.color.rgb=RGBColor(40,52,69)
styles['Normal'].paragraph_format.space_after=Pt(5); styles['Normal'].paragraph_format.line_spacing=1.08
for name,size,color in [('Title',28,'14345A'),('Heading 1',18,'14345A'),('Heading 2',13,'176B87'),('Heading 3',10.5,'176B87')]:
    s=styles[name]; s.font.name='Aptos Display' if name!='Heading 3' else 'Aptos'; s.font.size=Pt(size); s.font.bold=True; s.font.color.rgb=RGBColor.from_string(color)
    s.paragraph_format.space_before=Pt(10 if name!='Title' else 0); s.paragraph_format.space_after=Pt(5)

# Header/footer
header=sec.header.paragraphs[0]; header.text='CHECK-IN ROUTE ANALYTICS  |  OPERATING PROCEDURE'; header.style='Caption'; header.runs[0].font.color.rgb=RGBColor(90,112,136); header.runs[0].font.bold=True
footer=sec.footer.paragraphs[0]; footer.alignment=WD_ALIGN_PARAGRAPH.CENTER
r=footer.add_run('Internal working guide  •  Current application rules  •  Page '); r.font.size=Pt(8); r.font.color.rgb=RGBColor(100,116,139)
fld=OxmlElement('w:fldSimple'); fld.set(qn('w:instr'),'PAGE'); footer._p.append(fld)

def shade(cell, fill):
    tcPr=cell._tc.get_or_add_tcPr(); shd=OxmlElement('w:shd'); shd.set(qn('w:fill'),fill); tcPr.append(shd)
def set_cell_text(cell,text,bold=False,color='26384A',size=8.3):
    cell.text=''; p=cell.paragraphs[0]; p.paragraph_format.space_after=Pt(0); p.paragraph_format.space_before=Pt(0)
    rr=p.add_run(str(text)); rr.bold=bold; rr.font.name='Aptos'; rr.font.size=Pt(size); rr.font.color.rgb=RGBColor.from_string(color)
    cell.vertical_alignment=WD_CELL_VERTICAL_ALIGNMENT.CENTER

def table(headers, rows, widths=None):
    t=doc.add_table(rows=1, cols=len(headers)); t.alignment=WD_TABLE_ALIGNMENT.CENTER; t.autofit=False
    t.style='Table Grid'
    if widths:
        scale=6.25/sum(widths)
        widths=[w*scale for w in widths]
        tbl_pr=t._tbl.tblPr
        tbl_w=tbl_pr.find(qn('w:tblW'))
        if tbl_w is None:
            tbl_w=OxmlElement('w:tblW')
            tbl_pr.append(tbl_w)
        tbl_w.set(qn('w:w'),str(int(sum(widths)*1440)))
        tbl_w.set(qn('w:type'),'dxa')
        for col,w in zip(t.columns,widths): col.width=Inches(w)
    for i,h in enumerate(headers): set_cell_text(t.rows[0].cells[i],h,True,'FFFFFF',8); shade(t.rows[0].cells[i],'176B87')
    for n,row in enumerate(rows):
        cells=t.add_row().cells
        if widths:
            for c,w in zip(cells,widths): c.width=Inches(w)
        for i,val in enumerate(row):
            set_cell_text(cells[i],val,size=8)
            if n%2==1: shade(cells[i],'F1F6FA')
    header_props=t.rows[0]._tr.get_or_add_trPr()
    repeat_header=OxmlElement('w:tblHeader'); repeat_header.set(qn('w:val'),'true'); header_props.append(repeat_header)
    for row in t.rows:
        row_props=row._tr.get_or_add_trPr()
        row_props.append(OxmlElement('w:cantSplit'))
    doc.add_paragraph().paragraph_format.space_after=Pt(1)
    return t

def para(text='',boldlead=None):
    p=doc.add_paragraph()
    if boldlead and text.startswith(boldlead):
        p.add_run(boldlead).bold=True; p.add_run(text[len(boldlead):])
    else: p.add_run(text)
    return p

def bullets(items):
    for x in items:
        p=doc.add_paragraph(style='List Bullet'); p.paragraph_format.space_after=Pt(2); p.add_run(x)
def numbered(items):
    for x in items:
        p=doc.add_paragraph(style='List Number'); p.paragraph_format.space_after=Pt(3); p.add_run(x)

# Title page in compact form
p=doc.add_paragraph(style='Title'); p.add_run('Check In Route Analytics Dashboard SOP')
p=doc.add_paragraph(); p.paragraph_format.space_after=Pt(12); rr=p.add_run('Dashboard inventory, data sources, business rules, and operating steps'); rr.font.size=Pt(12); rr.font.color.rgb=RGBColor(23,107,135)
table(['Document control','Details'],[
('Version / reviewed','1.5 · 24 October 2026'),('Application','Check-In Route Analytics · browser-based CRM analytics'),('Purpose','Explain what each dashboard reports, how it calculates values, what source fields it uses, and how to operate and reconcile it.'),('Rule authority','Current application source code plus user-approved business clarifications recorded during implementation. Where rules differ by report, the report-specific rule is stated separately.')],[1.55,5.9])
para('Read this SOP as a guide to the current app. Calculated values come from the workbook loaded in that browser; manual plans and selected manual actuals are separate inputs. The same word, such as “Q1” or “unique,” can mean different things in separate dashboards, so use the report name and scope shown in each section.')
para('The current light theme follows the official CRM reference: a deep navy vertical navigation rail, compact white content cards, royal-blue active navigation and primary actions, with green reserved for secondary-sales accents. Use Appearance to switch Light, Dark, or System mode; the selection is retained in this browser.')

doc.add_heading('1. What the application contains',level=1)
para('The app is one browser-based application with shared uploads and separate report tabs. It does not combine the business rules of the Manager-only KPI, the Manager + Territory copy, the Q1–Q3 reports, and the weekly sales table.')
table(['Tab / section','What it shows','Primary inputs'],[
('Dashboard','Check-in records, employee/date filters, route on map, actual versus suggested visit sequence, route metrics.','Check-In workbook; Attendance and Dealer Master are optional enrichments.'),
('Tour Plan','Daily or monthly planned dealer visits, route map, approvals/locks, and plan-versus-actual matching.','Dealer Master required; Attendance and Check-In add route context.'),
('Check-in Analysis','Repeated employee/date/location/type groups, breakdowns, filters, and verification export.','Check-In workbook.'),
('Joint Working KPI','Original Manager-only Q1/Q2/Q3 table, plus the separate Manager + Territory version.','Check-In workbook.'),
('Q1–Q2 Reports','Dedicated Manager + Territory Q1 visit-day report and Q2 unique Channel Partner report.','Check-In workbook.'),
('Weekly Sales Performance','Weekly plan versus actual rows, editable plans, and manual retailer actuals.','Check-In workbook.'),
('CHECKIN-OUT REPORT','Employee-day attendance and visit-category summary with filters and exports.','Existing Check-In workbook; orders and sales await a verified Secondary Orders source.'),
('Employee Tour Plan','Historical employee/day route, attendance anchors, expected distance, and detailed route audit.','Check-In and Attendance; Dealer Master can enrich GPS.')],[1.55,3.15,2.75])

doc.add_heading('2. Standard operating procedure',level=1)
bullets([
    'Open the deployed application. A new browser tab shows the branded welcome image. Click Login to enter the dashboard; the welcome screen remains dismissed on refresh in that same tab and appears again when a new tab is opened after closing it. This is a start screen, not a credential check.',
    'Use the Download Dashboard SOP link in the page footer to retrieve the current published procedure.',
'Upload the current Check-In / Check-Out workbook. The app parses it in the browser for the current page session only; refreshing or closing the page clears uploaded report data, so upload the workbook again when you return.',
'Upload the matching Attendance Report for attendance start/stop times, coordinates, and route anchors. Upload Dealer Master for assigned dealers, planning, and optional visit-coordinate matching.',
'Weekly Sales Performance order count and amount use Check-In rows only; there is no separate Secondary Sales uploader in the dashboard.',
'CHECKIN-OUT REPORT reuses the same Check-In upload. Its order count and sale remain pending until the separate Secondary Orders source is inspected and connected.',
'Choose the dashboard tab and reporting month. Confirm the source file name and month before interpreting or exporting values.',
'Use Calculation Details or source audit tables to inspect source rows, eligibility, duplicates, missing identifiers, and exclusion reasons when a KPI does not reconcile.',
'Export the report after confirming its scope. CSV/Excel exports follow the report calculations; they do not change them.'
])
doc.add_heading('3. Welcome screen and tab behavior',level=1)
para('Each new browser tab starts on a branded welcome screen using the Check-In Route Analytics artwork, fitted in full without cropping. A prominent blue Login button sits above the screen midpoint. Login opens the dashboard and records dismissal in that tab’s sessionStorage. Refreshing the same tab keeps the dashboard open; closing the tab ends that session, so a newly opened tab shows the welcome screen again. The Login button is a navigation/start control and does not verify credentials.')
doc.add_heading('4. Uploaded data and saved settings',level=1)
para('Uploaded Check-In, Attendance, and Dealer Master files are session-only and are not retained after a page refresh or close. The app also clears any older persisted Check-In workbook from its previous storage version. Weekly plans, old/new retailer manual actuals, and appearance remain saved in local browser storage.')

doc.add_heading('5. Common data preparation and date handling',level=1)
bullets([
'Workbook values are parsed in the browser. The Check-In parser uses a CheckIn Report worksheet when it can find one; otherwise it uses the first worksheet. Header matching tolerates common header variations and case/punctuation differences.',
'Date parsing accepts Excel date serials, Date objects, day-first numeric dates such as 01-10-2026, and ISO dates. A report row is assigned to the month from its parsed date. Q1–Q3 reporting uses the source Date field; blank or invalid dates are audited and excluded from monthly buckets.',
'Employee identity for deduplication uses Emp ID when present; otherwise a normalized employee name (trimmed, repeated spaces collapsed, case-insensitive) is used. If both are blank, the record cannot contribute to an identity-based count.',
'Designations are normalized for whitespace and capitalization. Where a rule says comma-separated designations, tokens are parsed individually and matched as exact values, rather than substring matches.',
'Zonal Manager exclusions apply only to the reports whose rule explicitly names them. The Weekly Sales Performance table does not inherit Q1–Q3 Zonal Manager exclusions.'
])

doc.add_heading('6. Calendar buckets by report',level=1)
table(['Report','Weekly buckets','Half-month / extra bucket behavior'],[
('Joint Working KPI and Q1–Q3 family','W1 1–7 · W2 8–15 · W3 16–23 · W4 24–last day','1–15TH = W1 + W2. Second half = W3 + W4. Month length uses the selected calendar month.'),
('Weekly Sales Performance','W1 1–7 · W2 8–15 · W3 16–23 · W4 24–last day','No half-month totals in the weekly table.'),
],[1.8,2.7,2.95])
para('These current rules supersede older notes/screenshots that showed 8–14, 16–22, or 23–month-end. Do not mix those historical bucket labels into the current reports.')

doc.add_heading('7. Joint Working KPI tab',level=1)
para('The tab presents two separate tables: the original Manager-only dashboard and a copied Manager + Territory dashboard. The second is an additional scope; it must not change or replace the first dashboard’s results.')
doc.add_heading('7.1 Original Manager-only KPI',level=2)
para('The original table uses the Manager-only approved Sales User designation list. Territory Sales Officer (TSO), Territory Sales Incharge (TSI), and Territory Sales Manager (TSM) are not added to that existing KPI. The employee/partner designation checks, exclusions, bucket definitions, and calculations are kept within this original calculation configuration.')
table(['Metric','Current calculation'],[
('Q1 · Joint Working visit days','Joint Working = YES, nonblank Joint Working Name, approved Manager Sales User designation, and an approved Joint Working Designation. Count unique Manager Emp ID + date within each bucket; if no Emp ID, use normalized employee name. Manager subtotals are summed. The current implementation requires every comma-separated Manager and partner designation token to be in the relevant approved set.'),
('Q2 · Retailers visited with senior','Same qualifying joint-working/partner rule as Q1, then count each qualifying source row with Type DEALER or OTHER. Repeated qualifying source rows are not deduplicated.'),
('Q3 · Unique distributor visits','Approved Q3 Senior Sales User designation and Type CHANNEL PARTNER. Count a distributor identifier once per bucket using Code → Dealer Channel Partner → Company Name priority and normalized identifier matching. Unique set is shared across senior employees within a bucket.')],[1.85,5.6])
para('The original Manager-only designation lists live in the KPI configuration. Executive/BDO partner values include Executive-Sales variants, Business Development Officer variants, and Senior Executive-Sales variants. See Appendix A for the full configured lists.')
doc.add_heading('7.2 Manager + Territory copy',level=2)
para('This copy follows the same Q1/Q2/Q3 calculation pattern but adds the configured Territory Sales designation set to eligible Sales Users. It is intentionally a separate calculation option (`includeTerritory`); results from this copy are not written back into the original Manager-only table.')

doc.add_heading('8. Q1–Q2 Reports tab',level=1)
para('This report family has its own configuration, separate from the Manager-only KPI. The tab contains the dedicated Manager + Territory Q1 visit-day report and Q2 unique Channel Partner report. The original Manager-only Joint Working KPI remains on its own tab; its additional Manager-only table and the separate Q2 reference-pivot validation are not shown in this report view.')
doc.add_heading('8.1 Q1 · Manager joint working with eligible Executive / BDO',level=2)
bullets([
'Eligible Sales User role: approved Manager + TSO/TSI/TSM designation list (Appendix A).',
'Joint Working must equal YES; Joint Working Name must be nonblank; Joint Working Designation must contain at least one exact approved Executive/BDO token. A comma-separated value qualifies if any token is approved, so a mixed value such as “AGM-SALES, EXECUTIVE-SALES” can qualify through its Executive token.',
'Type must be DEALER. Zonal Managers SHOBHIT GOEL, OTHERS, ARCHIT GARG, and SHANTANU ATTARY are excluded.',
'Count one visit-day per eligible employee identity + date per week. A qualifying source row contributes at most once for that employee/date in that bucket. The report totals manager/employee subtotals; it does not count all raw rows.',
'The report exposes raw rows, valid-date/month rows, role-filtered rows, post-exclusion rows, Joint Working YES rows, named-partner rows, Executive/BDO matches, Dealer rows, identity rows, qualifying rows, duplicate rows removed, final unique visit-days, and row-level exclusion reasons.'
])
para('The October 2026 comparison references (61, 81, 58, 0; total 200) are validation references only. They are not hardcoded actuals. The dashboard actual must be supported by the loaded source records and its audit.')
doc.add_heading('8.2 Q2 · Unique Channel Partners',level=2)
bullets([
'Uses the configured Q3 Senior designation list (Appendix A5), Type CHANNEL PARTNER, and a usable distributor identifier. Joint Working = YES is not required.',
'Applies the configured Zonal Manager exclusions. The same normalized distributor identifier is counted once globally across eligible Managers within each week (not once per Manager). A distributor may be counted again in a different week.',
'Identifier priority: Dealer Channel Partner Code, then Dealer Channel Partner, then Company Name. Repeated source rows map to one weekly distributor. Audit data shows identifier source and contributing source rows.'
])
doc.add_heading('9. Weekly Sales Performance',level=1)
para('This is a plan-versus-actual table with eight KPIs and four weekly buckets. Plans are editable per week. Most actual values are calculated from Check-In; Old Retailer Retained and New Retailer Added are manual actuals.')
table(['KPI row','Plan / actual source and calculation'],[
('Total No. of SSP','Plan is editable. Actual is distinct eligible Manager + Territory employee identities per week with Joint Working = YES. Emp ID is preferred; normalized Sales User Name is fallback. This count has no Q1–Q3 Zonal Manager exclusion.'),
('Total Days of Joint Working','Plan is editable. Actual counts unique eligible employee identity + date pairs per week with Joint Working = YES.'),
('No. of Retailers Visited','Actual is sourced from the Q2 result of the original Manager + Territory Joint Working KPI calculation passed to this table; it is not recalculated from weekly sales order rows.'),
('No. of Orders Received from the Retailer Visited','Actual counts unique Type ID per week among Check-In rows with Joint Working = YES and Designation Sales Type = SECONDARY (or SECONDARY ORDER COUNT). Evidence is positive Secondary Order Count if that field exists; if it is absent, positive Basic Order Value is used. Blank Type IDs do not count.'),
('Total Order Amount','Actual sums Basic Order Value from Check-In rows with Joint Working = YES and Secondary sales type, by the selected week. Display amount rounds upward to the next whole rupee. This is the locked current rule for the weekly table.'),
('Average Order Value','Calculated as weekly Total Order Amount divided by the unique order-retailer count above, then rounded upward to a whole rupee. If there are no counted retailers, it displays Pending.'),
('Old Retailer Retained','Weekly plan is editable; actual is typed manually and saved in this browser. Blank actual displays Pending.'),
('New Retailer Added','Weekly plan is editable; actual is typed manually and saved in this browser. Blank actual displays Pending.')],[2.4,5.05])
para('Weekly order count and amount are calculated from the Check-In report only, using Joint Working and Secondary sales fields. The dashboard no longer includes a separate Secondary Sales workbook uploader; Basic Order Value and secondary order evidence in the Check-In source continue to drive these actuals.')
para('Known October 2026 reconciliation figures previously confirmed by the user for Total Order Amount are W1 ₹14,85,542; W2 ₹15,42,515; W3 ₹15,29,642. These are a cross-check against the relevant source workbook, not hardcoded outputs. W4 depends on records in the selected month after the 23rd.')

doc.add_heading('10. Dashboard',level=1)
bullets([
'Filters include date, Sales User, Emp ID, Reporting Manager, Type, and free-text search. Search supports fast matching across the displayed check-in data fields.',
'The visit table and map use the selected/filtered Check-In records. Actual visit order follows recorded Check-In time/source order. Route points require valid coordinates.',
'Attendance start/stop endpoints may anchor the actual route when matching attendance exists. Without attendance anchors the route can be incomplete and may use Check-In points only.',
'The suggested route reorders visit points geographically. It is advisory and does not alter source records. Route comparisons show distance, potential saving, route quality/pattern and direction changes based on available route distances/points.',
'Attendance Google KM is a source value and differs from route distance calculated from GPS. Dealer Master can enrich dealer matches and missing visit GPS when a unique match is available.',
'Exports include filtered or full Check-In rows and related route/report views, depending on the selected export action.'
])

doc.add_heading('11. Tour Plan',level=1)
bullets([
'Dealer Master is required to build assigned-customer plans. The employee/dealer assignment comes from the Dealer Master assignments.',
'Daily route planning selects assigned dealers with valid GPS, uses an Attendance base if available, organizes stops geographically, and checks configurable travel/visit constraints.',
'Monthly planning allocates customers over month dates and respects dealer plan dates and per-day settings. Plans can be approved/locked and exported.',
'Road routing is used when available. If unavailable, a straight-line estimate may be shown and is labeled as approximate. The suggested route is a planning aid.',
'Actual Check-In rows can be matched to planned visits within a configurable radius. A match indicates location correspondence, not a performance judgment.'
])

doc.add_heading('12. Check-in Analysis',level=1)
para('The integrity report groups rows by date + Emp ID + normalized location + normalized Type. Location precedence is Check-In Location, Company Name, then Dealer Channel Partner. Employee name is displayed but Emp ID is the grouping identity. Status levels are Normal (1 row), Duplicate (2–3), High Duplicate Activity (4–5), and Very High Duplicate Activity (6+).')
para('Available views include Overview, Employee Analysis, Location Analysis, Type Analysis, and Duplicate Verification. Filters include date range, employee, Emp ID, location, Type, and duplicate status. The verification CSV contains duplicate groups and first/last check-in time. Repeated patterns require review; the status does not establish that a check-in is false.')

doc.add_heading('13. Employee Tour Plan',level=1)
bullets([
'Builds a day-wise employee movement report from the union of Check-In and Attendance employee dates. Attendance Report is needed for reliable start/stop anchors.',
'Attendance start/stop positions are grouped into location clusters within 500 metres. The most repeated paired location is treated as the primary regular anchor. A different start/stop location is considered a temporary stay only when it recurs on at least two consecutive attendance dates.',
'Confidence: High at 5+ matched start/stop dates or 10+ observations; Medium at 2+ matched dates or 4+ observations; otherwise Low. Actual daily attendance endpoints are preferred; historical anchors may fill a missing endpoint and are flagged as inferred.',
'Planned Visits is the number of employee/day Check-In rows; source Check-Ins are not automatically deduplicated. Visit coordinates prefer Check-In GPS, then Check-Out GPS, then a matched Dealer Master point.',
'Expected KM covers start anchor → time-ordered visits → end anchor. If a required coordinate is unavailable, distance is not calculated. Road route is preferred; Haversine straight-line fallback is labeled estimated. Route audit exports show segments and coordinate source.'
])

doc.add_heading('14. CHECKIN-OUT REPORT',level=1)
para('This is a separate navigation tab and does not change the Q1–Q3 Reports Dashboard, Manager-only Joint Working KPI, or Weekly Sales Performance calculations. It reuses the currently loaded Check-In workbook and adds no mandatory upload.')
table(['Report field','Source mapping and calculation'],[
('DATE / Month','Date; Month is derived from the parsed date.'),
('BDO NAME / STATE NAME','BDO NAME uses Sales User Name (or BDO Name). STATE NAME uses State Name or State. Missing columns display SOURCE DATA REQUIRED.'),
('CHECK IN TIME / CHECK OUT TIME','Check In / Check In Time and Check Out / Check Out Time. Employee-day displays the earliest valid check-in and latest valid check-out.'),
('TOTAL WORKING TIME','Elapsed span from earliest valid check-in to latest valid check-out for the employee-day; valid daily spans are summed. Average divides that total by employee-day rows with both valid timestamps and a nonnegative span no longer than 18 hours.'),
('COUNTER PLANNED','Counter Planned, Counters Planned, or Planned Counters. Conflicting or missing values remain unavailable.'),
('COUNTER VISITED','Distinct Type ID for Type DEALER + OTHER/OTHERS. Repeated IDs count once per employee-day. Missing Type ID values in qualifying rows make that subtotal unavailable.'),
('CP VISIT','Distinct Type ID for Type CHANNEL PARTNER + DIRECT DEALER, counted separately from counters.'),
('TOTAL ORDER COUNT / SALE','Upload the separate Secondary Orders Excel/CSV in the uploader on this same tab. Order count is distinct Order ID / Order No / Invoice No matched to a Check-In employee-day by Date Created + employee ID (name fallback only when ID is missing). SALE sums Basic order value (Excel column V; legacy Basic Amount accepted) only. Other amount fields are ignored.'),
('REMARKS','Remark or Remarks; distinct nonblank notes from the employee-day are retained.'),
('Quality checks','00:00:00 requires source-convention validation and is not counted as valid. Negative spans and spans above 18 hours are flagged for review; source rows are not deleted.'),
('Filters and exports','Month, start/end date, BDO, state, attendance status, and remarks/exception search apply to KPI cards, detail rows, CSV, and Excel exports. The export keeps the exact 13 detail columns in the displayed order; the table supports sorting, pagination, and horizontal scrolling.')],[2.05,5.4])
para('KPI cards show Unique BDOs, Employee-day records, Valid Check-Ins, Valid Check-Outs, Total and Average Working Time, Total Counters Planned, Total Counters Visited, Counter Achievement %, Total CP Visits, Total Order Count, Total Sales, and records with missing/invalid attendance timestamps. Counter Achievement is Total Counters Visited ÷ Total Counters Planned × 100 when planned is greater than zero. Missing source values are not converted to zero. For secondary orders, rows outside the uploaded file date range remain pending; rows within the range with no matched order show zero. Duplicate Order IDs are counted once, unmatched orders are excluded and reported in uploader audit counts, and missing Basic Order Value prevents a complete sales total.')

doc.add_heading('15. Inputs, storage, and interpretation',level=1)
table(['Input','Used for','Important field behavior'],[
('Check-In / Check-Out workbook','All check-in dashboards and KPIs.','Date, employee, ID, designation, Type, Joint Working fields, distributor fields, Type ID, sales type, order count/value and GPS are used where present.'),
('Attendance Report','Dashboard enrichments, Tour Plan anchors, Employee Tour Plan.','Start/Stop time, GPS, employee ID, date, Google KM, address and manager context.'),
('Dealer Master','Tour Plan and optional check-in GPS matching.','Company/customer identity, account/customer code, assignments, plan dates, beat, address, GPS.'),
('Secondary Orders (optional, on CHECKIN-OUT REPORT)','Total Order Count and SALE in the Check-In Check-Out report.','Requires a unique Order ID/Order No/Invoice No, Date Created or a supported order date, employee ID or sales user name, and Basic order value (Excel V). The upload is browser-memory only and is cleared on refresh/close.'),
],[1.65,2.5,3.3])
para('The app processes Excel/CSV in the browser. Uploaded report files remain in page memory only and are cleared on refresh or close; weekly plans, manual actuals, and appearance are saved locally. Route display uses map tiles and route calculation may send coordinates to the configured public routing service; workbook rows and employee names are not needed for that route request. Routing availability can affect whether distance is road-based or estimated.')

doc.add_heading('16. Reconciliation checklist',level=1)
numbered([
'Confirm the current Check-In workbook name and the selected month.',
'Confirm source Date values and whether they are Excel dates or day-first text. Verify any blank/invalid date audit rows.',
'Confirm exact source headers and designation/type/sales-type values. Check for comma-separated designation tokens and whitespace/case variants.',
'For identity-based counts, compare Emp ID first; use normalized name only when Emp ID is blank. Identify blank identities separately.',
'Check each report’s own eligibility list and exclusions. Do not copy the territory-inclusive list into the original Manager-only KPI.',
'For unique calculations, review the displayed grouping key and scope: Manager + date (Q1) or global distributor by week (Q2).',
'Compare the weekly breakdown and source-row audit before comparing totals. Half-month KPI values equal W1+W2 or W3+W4 as applicable.',
'If an expected reference differs, retain the source-driven actual, document the exact rows/rules responsible, and do not hardcode actuals to force a match.'
])

doc.add_heading('Appendix A. Configured designation and exclusion lists',level=1)
para('Lists below are normalized exact values from the current business-rule configurations. The list named by a report section governs that report; the lists are not interchangeable.')
doc.add_heading('A1. Original Manager-only Q1/Q2 Sales User designations',level=2)
para('GM - SALES; DGM-SALES; AGM-SALES; SR.MANAGER-SALES (9); MANAGER-SALES; MANAGER-SALES (4); DEPUTY MANAGER-SALES; DEPUTY MANAGER-SALES (4); ASSISTANT MANAGER-SALES; ASSISTANT MANAGER-SALES (4); ASSISTANT MANAGER-SALES (NBD); ASSISTANT MANAGER-SALES (NBD) (4); SR. ASSISTANT MANAGER-SALES.')
doc.add_heading('A2. Original Manager-only eligible Joint Working designations',level=2)
para('EXECUTIVE-SALES; EXECUTIVE-SALES (4); BUSINESS DEVELOPMENT OFFICER; BUSINESS DEVELOPMENT OFFICER (4); SR. EXECUTIVE-SALES; SR. EXECUTIVE-SALES (4).')
doc.add_heading('A3. Territory designations added only to the copied Manager + Territory KPI',level=2)
para('SR. TERRITORY SALES INCHARGE (4); TERRITORY SALES INCHARGE; TERRITORY SALES INCHARGE (4); TERRITORY SALES MANAGER; TERRITORY SALES MANAGER (4); TERRITORY SALES OFFICER; TERRITORY SALES OFFICER (4); TERRITORY SALES OFFICER (NBD) (4).')
doc.add_heading('A4. Dedicated Q1–Q2 Reports Manager + Territory Senior list',level=2)
para('The list is the combined set in A1 and A3. Q1 accepts any approved Executive/BDO token from: EXECUTIVE-SALES; EXECUTIVE-SALES (4); BUSINESS DEVELOPMENT OFFICER; BUSINESS DEVELOPMENT OFFICER (4); SR. EXECUTIVE-SALES; SR. EXECUTIVE-SALES (4); SR. EXECUTIVE-BACKOFFICE.')
doc.add_heading('A5. Q1–Q3 report Q3 Senior list',level=2)
para('DEPUTY MANAGER-SALES; DEPUTY MANAGER-SALES (4); MANAGER-SALES; MANAGER-SALES (4); ASSISTANT MANAGER-SALES; ASSISTANT MANAGER-SALES (4); ASSISTANT MANAGER-SALES (NBD) (4); AGM-SALES; SR.MANAGER-SALES (9); DGM-SALES. Reports specifying Zonal Manager exclusions also omit SHOBHIT GOEL; OTHERS; ARCHIT GARG; SHANTANU ATTARY.')

doc.add_page_break()
doc.add_heading('Appendix B. Formula summary',level=1)
table(['Output','Formula / unit of count'],[
('Original KPI Q1','Sum by Manager of count(distinct date) for eligible rows within each week.'),
('Original KPI Q2','Count(qualifying source rows where Type is DEALER or OTHER). No duplicate removal.'),
('Original KPI Q3','Count(distinct normalized distributor identifier) per week across eligible rows.'),
('Dedicated Q1 report','Count(distinct Manager identity + date) per week, after Manager + Territory / JW / named partner / approved Executive-BDO / DEALER / zonal filters.'),
('Dedicated Q2 report','Count(distinct normalized distributor identifier) per week globally across eligible Managers, Type CHANNEL PARTNER.'),
('Weekly SSP','Count(distinct eligible employee identity) per week where Joint Working = YES.'),
('Weekly joint-working days','Count(distinct eligible employee identity + date) per week where Joint Working = YES.'),
('Weekly orders','Count(distinct Type ID) per week among secondary-sales Joint Working rows with positive order evidence.'),
('Weekly amount / AOV','Amount = sum Basic Order Value for qualifying Check-In rows, rounded up. AOV = amount ÷ unique order retailers, rounded up.'),
('Retailer manual actuals','Entered by a user per week; blank is Pending. Not computed from Check-In.'),
('Check-In/Check-Out employee-day','Group by Emp ID + parsed date. Rows without an Emp ID remain separate rather than being deduplicated by BDO name + date; unique BDO display may still use normalized names.'),
('Counter / CP visits','Distinct Type ID by employee-day: DEALER + OTHER/OTHERS for counters; CHANNEL PARTNER + DIRECT DEALER for CP visits.'),
('Check-In/Check-Out working time','Earliest valid Check In to latest valid Check Out; daily spans over 18 hours and negative spans are excluded from valid total and flagged.')],[1.7,5.75])

# keep heading with next paragraph and table rows together as practical
for p in doc.paragraphs:
    if p.style.name.startswith('Heading'):
        p.paragraph_format.keep_with_next=True

doc.core_properties.title='Check In Route Analytics Dashboard SOP'
doc.core_properties.subject='Dashboard inventory and calculation rules'
doc.core_properties.author='Check-In Route Analytics'
doc.save(out)
print(out)
