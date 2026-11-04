"""Write HANDMADE Course Explorer XML fixtures (the API host is blocked in the build session).

Values are copied from the real course-catalog CSV slice in fixtures/course-catalog/; the element layout
follows the Course Explorer REST schema (ns2 = http://rest.cis.illinois.edu). Each file says HANDMADE
at the top. Replace with real files via the fetch-data workflow when the network allows.
"""

from __future__ import annotations

import csv
from collections import defaultdict
from xml.sax.saxutils import escape, quoteattr

from .config import FIXTURES

HEADER = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    "<!-- HANDMADE FIXTURE: layout follows the Course Explorer REST schema; values copied from the real\n"
    "     wadefagen/datasets course-catalog CSV ({term}). Not fetched from courses.illinois.edu. -->\n"
)
SEASON_DIGIT = {"spring": "1", "summer": "5", "fall": "8"}


def _time(t: str) -> str:
    return t if t in ("", "ARRANGED") else f"{t[:5]} {t[5:]}"


def course_xml(term: str, subject: str, number: str) -> str:
    rows = [r for r in csv.DictReader(open(FIXTURES / "course-catalog" / f"{term}.csv", encoding="utf-8"))
            if r["Subject"] == subject and r["Number"] == number]
    r0 = rows[0]
    year, season = r0["Year"], r0["Term"].lower()
    tid = f"1{year}{SEASON_DIGIT[season]}"
    by_crn: dict[str, list[dict[str, str]]] = defaultdict(list)
    for r in rows:
        by_crn[r["CRN"]].append(r)
    base = "https://courses.illinois.edu/cisapp/explorer/schedule"
    out = [HEADER.format(term=term)]
    out.append(f'<ns2:course xmlns:ns2="http://rest.cis.illinois.edu" id="{subject} {number}" '
               f'href="{base}/{year}/{season}/{subject}/{number}.xml">\n')
    out.append(f'  <parents>\n    <calendarYear id="{year}" href="{base}/{year}.xml">{year}</calendarYear>\n'
               f'    <term id="{tid}" href="{base}/{year}/{season}.xml">{season.title()} {year}</term>\n'
               f'    <subject id="{subject}" href="{base}/{year}/{season}/{subject}.xml">{subject}</subject>\n'
               f"  </parents>\n")
    out.append(f"  <label>{escape(r0['Name'])}</label>\n  <description>{escape(r0['Description'])}</description>\n")
    out.append(f"  <creditHours>{escape(r0['Credit Hours'])}</creditHours>\n")
    if r0["Section Info"]:
        out.append(f"  <courseSectionInformation>{escape(r0['Section Info'])}</courseSectionInformation>\n")
    if r0["Degree Attributes"]:
        out.append(f"  <sectionDegreeAttributes>{escape(r0['Degree Attributes'])}</sectionDegreeAttributes>\n")
    if r0["Schedule Information"]:
        out.append(f"  <classScheduleInformation>{escape(r0['Schedule Information'])}</classScheduleInformation>\n")
    out.append("  <detailedSections>\n")
    for crn, meets in by_crn.items():
        m0 = meets[0]
        out.append(f'    <detailedSection id="{crn}" href="{base}/{year}/{season}/{subject}/{number}/{crn}.xml">\n'
                   f"      <sectionNumber>{m0['Section']}</sectionNumber>\n"
                   f"      <statusCode>{m0['Status Code']}</statusCode>\n"
                   f"      <partOfTerm>{m0['Part of Term']}</partOfTerm>\n"
                   f"      <sectionStatusCode>{m0['Section Status']}</sectionStatusCode>\n"
                   f"      <enrollmentStatus>{escape(m0['Enrollment Status'])}</enrollmentStatus>\n"
                   "      <meetings>\n")
        for i, m in enumerate(meets):
            out.append(f'        <meeting id="{i}">\n'
                       f"          <type code={quoteattr(m['Type Code'])}>{escape(m['Type'])}</type>\n"
                       f"          <start>{_time(m['Start Time'])}</start>\n")
            if m["End Time"]:
                out.append(f"          <end>{_time(m['End Time'])}</end>\n")
            if m["Days of Week"] not in ("", "n.a."):
                out.append(f"          <daysOfTheWeek>{m['Days of Week']}</daysOfTheWeek>\n")
            if m["Room"]:
                out.append(f"          <roomNumber>{escape(m['Room'])}</roomNumber>\n")
            if m["Building"] not in ("", "n.a."):
                out.append(f"          <buildingName>{escape(m['Building'])}</buildingName>\n")
            out.append("          <instructors>\n")
            for name in filter(None, (x.strip() for x in m["Instructors"].split(";"))):
                last, _, first = name.partition(", ")
                out.append(f"            <instructor lastName={quoteattr(last)} firstName={quoteattr(first)}>"
                           f"{escape(name)}</instructor>\n")
            out.append("          </instructors>\n        </meeting>\n")
        out.append("      </meetings>\n    </detailedSection>\n")
    out.append("  </detailedSections>\n</ns2:course>\n")
    return "".join(out)


def main() -> None:
    dest = FIXTURES / "course-explorer"
    dest.mkdir(parents=True, exist_ok=True)
    for term, subj, num in [("2027-sp", "CS", "124"), ("2026-fa", "MATH", "221"),
                            ("2027-sp", "STAT", "107"), ("2027-sp", "RHET", "105")]:
        p = dest / f"HANDMADE_{term}_{subj}{num}_cascade.xml"
        p.write_text(course_xml(term, subj, num), encoding="utf-8")
        print(p)
    (dest / "HANDMADE_schedule_2027_spring.xml").write_text(
        HEADER.format(term="2027-sp") +
        '<ns2:term xmlns:ns2="http://rest.cis.illinois.edu" id="120271">\n  <label>Spring 2027</label>\n'
        "  <subjects>\n"
        '    <subject id="CS" href="https://courses.illinois.edu/cisapp/explorer/schedule/2027/spring/CS.xml">'
        "Computer Science</subject>\n"
        '    <subject id="STAT" href="https://courses.illinois.edu/cisapp/explorer/schedule/2027/spring/STAT.xml">'
        "Statistics</subject>\n  </subjects>\n</ns2:term>\n", encoding="utf-8")


if __name__ == "__main__":
    main()
