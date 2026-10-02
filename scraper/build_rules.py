"""Build academic_rules.json: a curated, quote-verified digest of SF State academic rules.

Every rule carries a verbatim `quote` that must appear in the parsed source page
(data/sfsu/policies.json); the build fails if any quote is not found.
Usage: python3 scraper/build_rules.py [data_dir]
"""
import json
import os
import re
import sys

DATA = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), "..", "data", "sfsu")
BASE = "https://bulletin.sfsu.edu/"

PP = "policies-procedures"
GRADING = "policies-procedures/grading"
STANDARDS = "policies-procedures/academic-standards"
DEGREQ = "undergraduate-education/degree-requirements"
UGED = "undergraduate-education"
MAJORS = "undergraduate-education/majors"
MINORS = "undergraduate-education/minors"
GRADPOL = "graduate-education/academic-policies-procedures"
GRADREG = "graduate-education/registration"
GRADADM = "graduate-education/admissions"
DIST = "policies-procedures/scholastic-distinction"
GRAD = "policies-procedures/graduation-commencement"
FA = "fees-financial-aid/student-financial-aid"
UDGE = "undergraduate-education/general-education/upper-division"
LDGE = "undergraduate-education/general-education/lower-division"
SFS = "undergraduate-education/sf-state-studies"
COMP = "undergraduate-education/complementary-studies"
TERMS = "courses/courses-terms"

# (id, category, applies_to, rule, values, source_page, quote)
RULES = [
    # ---------------------------------------------------------------- graduation units (undergraduate)
    ("ug_units_to_graduate", "graduation_units", "undergraduate",
     "A bachelor's degree (B.A. or B.S.) requires a minimum of 120 semester units.",
     {"min_units": 120}, PP,
     "An undergraduate student who has completed all of the requirements for graduation and has a total of 120 semester units is eligible to graduate with a baccalaureate degree."),
    ("ug_residence_units", "graduation_units", "undergraduate",
     "At least 30 units must be earned in residence at SF State, including 24 upper-division units and 12 units in the major.",
     {"min_residence_units": 30, "min_upper_division_in_residence": 24, "min_major_units_in_residence": 12}, DEGREQ,
     "Residence Requirement: 30 units minimum at SF State, including 24 units upper-division, and 12 units in the major (lower- or upper-division)."),
    ("ug_residence_ud_ge", "graduation_units", "undergraduate",
     "Nine of the 30 residence units must be earned in upper-division General Education.",
     {"min_ud_ge_units_in_residence": 9}, PP,
     "Nine of these residence units must be earned in the Upper Division portion of the General Education program."),
    ("ug_upper_division_units", "graduation_units", "undergraduate",
     "At least 30 upper-division units (courses numbered 300-699) are required for the bachelor's degree.",
     {"min_upper_division_units": 30}, PP,
     "For the award of the baccalaureate degree, all students are required to complete a minimum of 30 upper-division units (courses numbered 300-699 at SF State)."),
    ("ug_max_community_college_units", "transfer_credit", "undergraduate",
     "At most 70 semester units of community college work count toward the degree.",
     {"max_units": 70}, PP,
     "The University accepts a maximum of 70 semester units for work completed at a community college."),
    ("ug_max_extension_units", "transfer_credit", "undergraduate",
     "At most 24 semester units of extension and correspondence credit count toward the degree.",
     {"max_units": 24}, PP,
     "The University accepts a maximum of 24 semester units of extension credit and correspondence courses towards award of a baccalaureate degree."),
    ("ug_max_exam_units", "transfer_credit", "undergraduate",
     "At most 30 units by examination or evaluation count toward the degree.",
     {"max_units": 30}, DEGREQ,
     "Maximum Units by Examination or Evaluation: 30 units."),
    ("ug_max_cr_units", "grading", "undergraduate",
     "No more than 24 SF State units applied to the bachelor's degree may be graded CR (Credit). Major courses offered only as CR/NC don't count toward the 24.",
     {"max_cr_units": 24}, DEGREQ,
     "No more than 24 units earned at SF State and applied toward the undergraduate degree may be taken for a grade of CR. Major courses only offered as CR/NC are not included in the 24 unit maximum."),
    ("ug_max_685_units", "graduation_units", "undergraduate",
     "At most 4 units of courses numbered 685 titled 'Projects in Teaching...' apply to the bachelor's degree.",
     {"max_units": 4}, DEGREQ,
     'Maximum Units for Courses Numbered "685" and Titled "Projects in Teaching . . ." That may be Applied to the Baccalaureate Degree: 4 units.'),
    ("ug_min_gpa_graduation", "gpa", "undergraduate",
     "Graduation requires a 2.0 GPA or better in combined cumulative, SF State, and major coursework.",
     {"min_gpa": 2.0}, STANDARDS,
     "To be eligible for graduation, students must achieve a combined cumulative, SF State, and major GPA of 2.0 or better."),
    ("ug_ge_units", "general_education", "undergraduate",
     "General Education requires at least 43 units.",
     {"min_units": 43}, DEGREQ,
     "General Education Requirements – 43 units minimum"),
    ("ug_ge_upper_division", "general_education", "undergraduate",
     "Upper-division GE requires at least 9 units: one 3-unit course each in 2UD or 5UD (science/quantitative reasoning), 3UD (arts/humanities), and 4UD (social/behavioral sciences).",
     {"min_units": 9, "areas": ["2UD or 5UD", "3UD", "4UD"]}, UDGE,
     "Upper-Division General Education — 9 Units Minimum"),
    ("ug_ge_ud_prereqs", "general_education", "undergraduate",
     "Upper-division GE courses require 1A, 1B, 1C and Area 2 first; they're recommended after 60 units.",
     {"prerequisite_areas": ["1A", "1B", "1C", "2"], "recommended_after_units": 60}, UDGE,
     "Minimally, all of these courses have a prerequisite of English Composition (1A), Critical Thinking (1B), Oral Communication (1C), and Mathematical Concepts and Quantitative Reasoning (2)."),
    ("ug_ge_area1", "general_education", "undergraduate",
     "GE Area 1 (English Communication): at least 9 units, 3 each in 1A English Composition, 1B Critical Thinking, 1C Oral Communication.",
     {"area": "1", "min_units": 9}, LDGE,
     "Students must complete a minimum of nine units in Area 1, including a minimum of three units in each of the following three areas: English Composition, Critical Thinking, and Oral Communication."),
    ("ug_ge_area3", "general_education", "undergraduate",
     "GE Area 3 (Arts and Humanities): at least 6 units, 3 in Arts (3A) and 3 in Humanities (3B).",
     {"area": "3", "min_units": 6}, LDGE,
     "Students must complete a minimum of 6 units in Area 3 including three units in Arts (3a) and three units in Humanities (3B)."),
    ("ug_ge_area5", "general_education", "undergraduate",
     "GE Area 5 (Physical and Biological Sciences): at least 7 units, including 3 in physical science and 3 in biological science (plus a 1-unit lab, 5C).",
     {"area": "5", "min_units": 7}, LDGE,
     "All students must complete a minimum of 7 units in Area 5, including a minimum of three units in each of the following two areas: Physical Science and Biological Science."),
    ("ug_ge_table", "general_education", "undergraduate",
     "GE requirement table: 1A 3, 1B 3, 1C 3, 2 3, 3A 3, 3B 3, 4 6, 5A 3, 5B 3, 5C 1, 6 (Ethnic Studies, LD or UD) 3, 2UD/5UD 3, 3UD 3, 4UD 3. Area 4 also covers U.S. History (USH).",
     {"areas": {"1A": 3, "1B": 3, "1C": 3, "2": 3, "3A": 3, "3B": 3, "4": 6, "5A": 3, "5B": 3, "5C": 1, "6": 3,
                "2UD_or_5UD": 3, "3UD": 3, "4UD": 3}}, UGED,
     "*Students will fulfill USH through their Area 4 courses"),
    ("ug_gwar", "writing", "undergraduate",
     "Every bachelor's program requires a Graduation Writing Assessment Requirement (GWAR) course, marked 'GW' after the number, passed with C- or better.",
     {"min_grade": "C-", "course_suffix": "GW"}, DEGREQ,
     "These courses are identified with a GW after the course number and must be completed with a grade of C- or better to meet the requirement."),
    ("ug_sf_state_studies", "sf_state_studies", "undergraduate",
     "Undergraduates must take courses covering all four SF State Studies areas: AERM, ESCA, GP and SJ. Courses may come from GE, major, minor or electives. Students with a verified AA-T/AS-T in a similar major are exempt.",
     {"areas": ["AERM", "ESCA", "GP", "SJ"]}, DEGREQ,
     "Undergraduate students must complete courses that cover the four areas of SF State Studies: American Ethnic and Racial Minorities (AERM), Environmental Sustainability and Climate Action (ESCA), Global Perspectives (GP), and Social Justice (SJ)."),
    ("ug_american_institutions", "american_institutions", "undergraduate",
     "American Institutions has two parts: U.S. History (USH) and U.S. and California Government (USG/CSLG).",
     {"components": ["U.S. History", "U.S. and California Government"]}, DEGREQ,
     "The American Institutions requirement consists of two categories:"),
    ("ug_complementary_studies", "major", "undergraduate",
     "B.A. students may need at least 12 units of Complementary Studies outside the major's primary prefix.",
     {"min_units": 12}, COMP,
     "Bachelor of Arts students may be required to complete at least 12 units of Complementary Studies outside of the primary prefix for the major."),
    ("ug_declare_major", "major", "undergraduate",
     "Students who enter as freshmen must declare a major by the time they complete 70 units.",
     {"declare_by_units": 70}, MAJORS,
     "Students who enter SF State as freshmen must declare a major by the time they complete 70 units."),
    ("ug_major_gpa", "major", "undergraduate",
     "The major requires a minimum 2.0 GPA; some majors set higher grade minimums.",
     {"min_gpa": 2.0}, MAJORS,
     "Students must have a minimum 2.0 grade point average (GPA) in their major."),
    ("ug_major_ge_double_count", "major", "undergraduate",
     "Any number of GE courses may also count toward the major, but their units count once toward the 120.",
     {}, MAJORS,
     "If applicable, an unlimited number of courses used to meet General Education requirements may be used to fulfill major requirements."),
    ("ug_change_major_catalog", "major", "undergraduate",
     "When you declare or change a major after admission, you follow the major requirements in effect at the time of the declaration/change.",
     {}, MAJORS,
     "Students who change their major after being admitted or who declare a major after being admitted with an undeclared major must fulfill the major requirements in effect at the time they declare or change their major."),
    ("ug_minor_min_units", "minor", "undergraduate",
     "A minor requires at least 12 units; at least half must be taken at SF State and at least 6 units must be upper-division; 2.0 GPA in the minor; no major and minor in the same discipline.",
     {"min_units": 12, "min_upper_division_units": 6, "min_fraction_in_residence": 0.5, "min_gpa": 2.0}, MINORS,
     "A minor must include a minimum of 12 units."),
    ("ug_minor_residence", "minor", "undergraduate",
     "At least half the minor's units must be taken at SF State and at least 6 must be upper-division.",
     {"min_upper_division_units": 6}, MINORS,
     "At least half of the units making up the minor must be taken at SF State, and at least 6 units must be upper-division."),
    ("ug_time_limit", "graduation_units", "undergraduate",
     "No general time limit for undergraduate units, but departments may require retaking major/minor/certificate courses taken more than 7 years before graduation.",
     {"years": 7}, PP,
     "However, if any course required for the major, minor, or certificate was taken more than seven years prior to graduation, then departments and programs may require students to retake that course or demonstrate currency in that subject."),
    ("class_levels", "class_level", "undergraduate",
     "Class level by earned units: Freshman 0-29, Sophomore 30-59, Junior 60-89, Senior 90+.",
     {"freshman": [0, 29], "sophomore": [30, 59], "junior": [60, 89], "senior": [90, None]}, PP,
     "The class level of students is determined according to units completed (earned units) as follows:"),

    # ---------------------------------------------------------------- unit load per semester
    ("ug_average_load", "unit_load", "undergraduate",
     "15 units is an average full-time undergraduate semester load.",
     {"average_units": 15}, PP,
     "15 units are considered an average semester course load for full-time undergraduate students."),
    ("normal_load", "unit_load", "all",
     "Normal load: undergraduates 12-15 units per fall/spring semester (8 in summer); graduates 9-12 (7 in summer). Expect two hours of preparation for every hour of class.",
     {"undergraduate": {"fall_spring": [12, 15], "summer": 8}, "graduate": {"fall_spring": [9, 12], "summer": 7}}, PP,
     "During spring and fall, the normal academic load for undergraduates is 12 to 15 units per semester and 8 units in the summer. For graduates, the normal load during spring and fall is from 9 to 12 units per semester and 7 units during the summer."),
    ("ug_max_units_priority_registration", "unit_load", "undergraduate",
     "During priority registration undergraduates can register for at most 19 units, including up to 8 wait-listed units.",
     {"max_units": 19, "max_waitlisted_units": 8}, PP,
     "During priority registration, students may register for a maximum of 19 units of enrolled, including 8 units of wait-listed courses."),
    ("grad_max_units_registration", "unit_load", "graduate",
     "Graduate students can register for at most 16 units, including up to 9 wait-listed units.",
     {"max_units": 16, "max_waitlisted_units": 9}, PP,
     "Graduate students may register for a maximum of 16 units of enrolled, including 9 units of wait-listed courses."),
    ("ug_max_units_academic_notice", "unit_load", "undergraduate",
     "Undergraduates on academic notice may enroll in at most 13 units (starting with their second semester on notice).",
     {"max_units": 13}, PP,
     "Undergraduate students on academic notice may enroll in a maximum of 13 units (this does not go into effect until a student’s second semester on academic notice)."),
    ("ug_max_units_summer", "unit_load", "undergraduate",
     "Summer maximums (undergraduate): 7 units in a 5-week session, 9 in an 8-week, 12 in a 10-week, 14 across all summer sessions combined (including 8 wait-listed).",
     {"five_week": 7, "eight_week": 9, "ten_week": 12, "summer_total": 14}, PP,
     "During the summer semester, undergraduate students may enroll in a maximum of 7 units in a five-week summer session, 9 units in an eight-week session, 12 units in a ten-week summer session, and a maximum of 14 units in any combination of summer semester sessions, including 8 units of wait-listed courses."),
    ("ug_exceed_max_units", "unit_load", "undergraduate",
     "To exceed the maximum, undergraduates need a cumulative SF State GPA of 3.0+ and an approved Exceed Maximum Units Petition (major advisor, department chair, college dean).",
     {"min_gpa": 3.0, "form": "Exceed Maximum Units Petition"}, PP,
     "Undergraduate students who want to enroll in more than the maximum units listed above must have a cumulative SF State grade point average of 3.0 or better and secure approval via the Exceed Maximum Units Petition."),
    ("ug_25_units", "unit_load", "undergraduate",
     "Enrolling in 25 or more units in one semester requires approval from the advisor, college dean, and Dean of Undergraduate Education and Academic Planning.",
     {"threshold_units": 25}, PP,
     "Students who wish to enroll in 25 or more units in one semester must receive the approval of their advisor, their college dean, and the Dean of Undergraduate Education and Academic Planning using the Exceed Maximum Units Petition."),
    ("intl_min_units", "unit_load", "all",
     "International (F-1) students must carry at least 12 units (undergraduate) or 8 units (graduate) each fall and spring.",
     {"undergraduate_min": 12, "graduate_min": 8}, PP,
     "For international students in F1 visa status, immigration regulations require a minimum academic load of 12 units for undergraduates and 8 units for graduates for spring and fall semesters."),
    ("fa_enrollment_status", "unit_load", "undergraduate",
     "Financial-aid enrollment status: full-time = 12 units, three-quarter time = 9-11, half-time = 6-8.",
     {"full_time": 12, "three_quarter": [9, 11], "half_time": [6, 8]}, FA,
     "Enrollment requirement: full time = 12 units; three-quarter time = 9-11 units; half-time = 6-8 units."),
    ("grad_full_time", "unit_load", "graduate",
     "Graduate full-time in fall/spring: 6.1+ units for fee purposes, 8+ for financial aid and international students; typical load 9-12.",
     {"fees": 6.1, "financial_aid": 8, "international": 8, "typical": [9, 12]}, GRADREG,
     "For those receiving financial aid, 8 units and above"),
    ("grad_max_units", "unit_load", "graduate",
     "Graduate maximum with advisor permission is 16 units; more than 16 needs GPA 3.25+ and a petition; post-baccalaureate students normally can't exceed 18 units.",
     {"max_units": 16, "petition_min_gpa": 3.25, "absolute_max": 18}, GRADREG,
     "The maximum unit load with the permission of the designated faculty advisor is 16 units."),
    ("grad_max_units_summer", "unit_load", "graduate",
     "Graduate summer maximums: 6 units in a 5-week session, 9 in an 8- or 10-week session, 11 across all summer sessions.",
     {"five_week": 6, "eight_or_ten_week": 9, "summer_total": 11}, GRADREG,
     "Graduate students may enroll in a maximum of 6 units in a five-week summer session, 9 units in the eight or ten-week summer session, and 11 units in any combination of summer sessions (R1, R2, R3, and R4)."),
    ("va_full_time", "unit_load", "all",
     "For VA benefits, undergraduates must complete 12+ units and graduates 8+ upper-division/graduate units (9+ if any lower-division) per term for maximum benefits.",
     {"undergraduate": 12, "graduate": 8}, PP,
     "undergraduates must register for and complete 12 or more semester units of credit to receive maximum benefits."),

    # ---------------------------------------------------------------- registration, add/drop, withdrawal
    ("add_deadline", "registration", "all",
     "Courses can be added with an instructor-issued permission number during the first three weeks of the semester.",
     {"weeks": 3}, PP,
     "they may add courses via the SF State Gateway at gateway.sfsu.edu with instructor assigned permission numbers during the first three weeks of the semester."),
    ("drop_first_three_weeks", "registration", "all",
     "During the first three weeks, courses can be dropped without restriction or penalty; drops don't appear on the transcript or count toward the withdrawal limit.",
     {"weeks": 3}, PP,
     "During the first three weeks of instruction, students are permitted to drop classes without restriction or academic penalty."),
    ("withdraw_weeks_4_12", "withdrawal", "all",
     "Weeks 4-12: withdrawal requires serious and compelling reasons plus instructor and department chair approval; results in a W (not in GPA).",
     {"weeks": [4, 12], "grade": "W"}, PP,
     "students may request to withdraw from courses for serious and compelling reasons, as specified by the student."),
    ("withdraw_week_13_on", "withdrawal", "all",
     "Week 13 to end of instruction: withdrawal only for circumstances clearly beyond the student's control (e.g., accident, serious illness), with documentation and instructor, chair and dean approval.",
     {"from_week": 13}, PP,
     "where the cause of withdrawal is due to circumstances clearly beyond the student's control and the assignment of an Incomplete is not practicable."),
    ("ug_withdraw_limit", "withdrawal", "undergraduate",
     "Undergraduates may withdraw from at most 18 units over their entire SF State career.",
     {"max_units": 18}, PP,
     "Undergraduates may withdraw from a maximum of 18 units throughout their entire SF State undergraduate career (see Grading Policy)."),
    ("withdraw_deadline", "withdrawal", "all",
     "All withdrawal requests must be submitted by the last day of instruction.",
     {}, PP,
     "Academic Policy requires that all requests to withdraw from a course must be submitted no later than the last day of instruction of that term."),
    ("readmission_three_semesters", "registration", "all",
     "Students who don't enroll for three consecutive semesters (excluding summer) must apply for readmission.",
     {"semesters": 3}, PP,
     "Students who do not enroll for three consecutive semesters (excluding summer) must apply for readmission to the University."),
    ("audit", "registration", "all",
     "Auditors pay the same fees; switching audit to credit must happen by the add deadline; credit to audit isn't allowed after week 2.",
     {}, PP,
     "A student who is enrolled for credit may not change to audit after the second week of instruction."),
    ("leave_of_absence", "registration", "all",
     "Continuing students can be absent up to two consecutive fall/spring semesters without losing eligibility; a Planned Educational Leave is needed for 3+ consecutive semesters.",
     {"max_semesters_without_leave": 2}, PP,
     "Continuing students can be absent up to two consecutive fall or spring semesters during a specific academic year and maintain their eligibility."),

    # ---------------------------------------------------------------- grading
    ("grade_points", "grading", "all",
     "Grade points per unit: A 4.0, A- 3.7, B+ 3.3, B 3.0, B- 2.7, C+ 2.3, C 2.0, C- 1.7, D+ 1.3, D 1.0, D- 0.7, F 0, IC 0, WU 0. W, I, AU, RP, RD, CR, NC carry no grade points. There is no A+.",
     {"A": 4.0, "A-": 3.7, "B+": 3.3, "B": 3.0, "B-": 2.7, "C+": 2.3, "C": 2.0, "C-": 1.7, "D+": 1.3, "D": 1.0,
      "D-": 0.7, "F": 0.0, "IC": 0.0, "WU": 0.0}, GRADING,
     "No other grading symbol, including W, I, AU, RP, RD, CR, and NC, carries grade point credit."),
    ("gpa_formula", "grading", "all",
     "GPA = total grade points / total units attempted in A-F graded courses (adjusted by the course repeat policy).",
     {}, GRADING,
     "Grade point averages are determined by dividing the total number of grade points earned by the total number of units attempted in courses in which A–F grades are assigned."),
    ("cr_definition", "grading", "all",
     "CR means A through C- work in an undergraduate course, or A through B- in a graduate course.",
     {"undergraduate_equivalent": "A to C-", "graduate_equivalent": "A to B-"}, GRADING,
     "Performance of the student in an undergraduate-level course has been equivalent to grades A through C-; performance of the student in a graduate level course has been equivalent to grades A through B-."),
    ("grading_option_deadline", "grading", "all",
     "The deadline to change grading option (e.g., to CR/NC) is one week before the last day of instruction.",
     {}, GRADING,
     "Students must elect to change their grading option by the Grading Option deadline each semester, which is one week before the last day of instruction."),
    ("grad_cr_limit", "grading", "graduate",
     "For a master's degree, at most 30% of Advancement to Candidacy units may be CR.",
     {"max_fraction": 0.3}, GRADING,
     "For students working toward a master's degree, no more than 30% of the units used on the Advancement to Candidacy, including transfer work, may be taken for CR grades."),
    ("incomplete", "grading", "all",
     "An Incomplete (I) requires passing work and normally 75%+ of coursework done. It must be made up within one calendar year, or it becomes IC, which counts as F.",
     {"deadline": "1 calendar year", "min_completed": 0.75}, GRADING,
     "An incomplete must normally be made up within one calendar year immediately following the end of the term during which it was assigned"),
    ("wu_grade", "grading", "all",
     "WU (unauthorized withdrawal) counts as a failing grade in the GPA.",
     {}, GRADING,
     "The WU symbol shall be identified as a failing grade in the transcript legend, and shall be counted as units attempted but not passed in computing the grade point average."),

    # ---------------------------------------------------------------- repeats / grade forgiveness
    ("ug_repeat_rules", "repeat", "undergraduate",
     "Undergraduates can't repeat a course passed with C or better (or CR) unless it's repeatable for credit. A course with a grade below C (including W, WU, etc.) may be repeated only once more.",
     {"repeat_if_below": "C", "max_additional_attempts": 1}, PP,
     "An undergraduate student who has received a grade in a course that is lower than C, including AU, IC, RD, RP, W, and WU, may repeat that course only once more."),
    ("ug_grade_forgiveness", "repeat", "undergraduate",
     "Up to 16 units of SF State coursework can be repeated for grade forgiveness (the lower grade is excluded from the GPA). It doesn't apply to academic dishonesty.",
     {"max_units": 16}, GRADING,
     "Undergraduate students may repeat a maximum of 16 units of coursework taken at San Francisco State University for the purpose of excluding the original grade from grade point determination."),
    ("ug_repeat_cap", "repeat", "undergraduate",
     "After repeating 28 units of SF State coursework, undergraduates can't repeat more courses (except those repeatable for credit).",
     {"max_units": 28}, PP,
     "An undergraduate student cannot repeat any courses once they have repeated 28 units of SF State units unless the course is described in the Bulletin as repeatable for credit."),
    ("repeat_default", "repeat", "all",
     "Courses can't be repeated for additional credit unless the course description says so.",
     {}, PP,
     "Unless otherwise stated in the course descriptions in the current SF State Bulletin, courses may not be repeated for additional units of credit."),
    ("grad_repeat", "repeat", "graduate",
     "Graduate students can repeat a course graded below B- (or IC, W, WU) once, if the program permits. Both grades stay on the transcript and are averaged.",
     {"repeat_if_below": "B-", "max_additional_attempts": 1}, GRADPOL,
     "A graduate student who has received a grade of B– or better, or a grade of CR, may not repeat a course unless the course is described in the current SF State Bulletin as repeatable for credit."),

    # ---------------------------------------------------------------- academic standing (undergraduate)
    ("ug_good_standing", "academic_standing", "undergraduate",
     "Good academic standing means a 2.0 GPA or better.",
     {"min_gpa": 2.0}, STANDARDS,
     "Undergraduate students with a 2.0-grade point average (GPA) or better are said to be in **good academic standing**."),
    ("ug_academic_notice", "academic_standing", "undergraduate",
     "An SF State or combined cumulative GPA below 2.0 puts an undergraduate on academic notice; a second semester below 2.0 makes them subject to disqualification (mandatory advising, registration hold).",
     {"threshold_gpa": 2.0}, STANDARDS,
     "Undergraduate students with an SF State and/or combined cumulative GPA of less than 2.0 are not in good academic standing and will be placed on academic notice (Academic Senate Policy S23-275)."),
    ("ug_disqualification", "academic_standing", "undergraduate",
     "Disqualification happens if term GPA < 2.0 and cumulative GPA is below: 1.50 (freshman <30 units), 1.70 (sophomore 30-59), 1.85 (junior 60-89), 1.95 (senior 90+).",
     {"freshman": 1.50, "sophomore": 1.70, "junior": 1.85, "senior": 1.95}, STANDARDS,
     "As a senior (90 or more units completed), their SF State or combined cumulative GPA is below 1.95."),
    ("ug_readmission_after_dq", "academic_standing", "undergraduate",
     "Disqualified students must raise SF State and combined GPAs to 2.0 to be reinstated (SF State GPA via Open University).",
     {"min_gpa": 2.0}, STANDARDS,
     "Students who have been academically disqualified from SF State must raise their SF State and combined cumulative GPAs to a 2.0 or better to be reinstated or readmitted to SF State."),

    # ---------------------------------------------------------------- honors
    ("deans_list", "honors", "undergraduate",
     "Dean's List: 12+ A-F graded units completed in the semester with a semester GPA of 3.25 or better.",
     {"min_units": 12, "min_semester_gpa": 3.25}, DIST,
     "The student attained a GPA of 3.25 or better for the semester."),
    ("latin_honors", "honors", "undergraduate",
     "Graduation honors by cumulative GPA: cum laude 3.50-3.69, magna cum laude 3.70-3.84, summa cum laude 3.85+. GPA is not rounded.",
     {"cum_laude": [3.50, 3.69], "magna_cum_laude": [3.70, 3.84], "summa_cum_laude": [3.85, 4.0]}, DIST,
     "A student whose GPA is 3.85 or greater shall graduate **summa cum laude**."),

    # ---------------------------------------------------------------- graduate degrees
    ("grad_min_units", "graduation_units", "graduate",
     "Minimum units: master's (M.A., M.S., M.P.H., M.M.) 30; M.F.A. 60; doctorates (Ed.D., D.P.T.) 60.",
     {"masters": 30, "mfa": 60, "doctoral": 60}, GRADPOL,
     "Master’s degrees (M.A., M.S., M.P.H., M.M.): 30 units"),
    ("grad_gpa", "gpa", "graduate",
     "Graduate students need a 3.0 GPA in all post-baccalaureate SF State work and on the ATC; non-supervisory ATC courses need B- or better.",
     {"min_gpa": 3.0, "min_atc_course_grade": "B-"}, GRADPOL,
     "All non-supervisory courses listed on the ATC must have a grade of B- or higher."),
    ("grad_standing", "academic_standing", "graduate",
     "Graduate students go on academic notice/probation if overall, SF State or semester GPA falls below 3.0.",
     {"threshold_gpa": 3.0}, GRADPOL,
     "Students will be placed on academic notice/probation if the overall, SF State, or semester GPA falls below 3.0 (B)."),
    ("grad_seven_year_limit", "time_limit", "graduate",
     "Master's and doctoral degrees must be completed within seven years; one extension of up to one year may be requested.",
     {"years": 7, "max_extension_years": 1}, GRADPOL,
     "Title 5 of the California Code of Regulations requires that a master’s or doctoral degree shall be completed in no more than seven years."),
    ("grad_progress", "time_limit", "graduate",
     "Graduate students must complete at least 6 units each year (excluding summer).",
     {"min_units_per_year": 6}, GRADPOL,
     "Graduate students must make continuous satisfactory progress toward their degree by completing a minimum of 6 units each year, not including the summer session."),
    ("grad_residence", "graduation_units", "graduate",
     "At least 21 of 30 master's units must be taken in residence (proportionally more for larger programs).",
     {"min_residence_units": 21, "of_units": 30}, GRADPOL,
     "At least 21 of 30 units must be taken in residence on this campus or proportionally more for programs that exceed 30 units."),
    ("grad_transfer_units", "transfer_credit", "graduate",
     "At most 9 semester units of transfer/CPaGE coursework may apply to a 30-unit graduate program (more for 45+ unit programs).",
     {"max_units": 9}, GRADADM,
     "a maximum of **9 semester units**, including any combination of transfer units or coursework through the College of Professional & Global Education, may be used to meet the requirements of a 30 unit program"),
    ("grad_open_university", "transfer_credit", "graduate",
     "At most 6 Open University units may apply to a 30-unit master's (no more than 12 for larger degrees).",
     {"max_units": 6}, GRADREG,
     "Students may apply no more than **6 units** taken through Open University enrollment toward a 30 unit master’s degree"),
    ("ug_grad_courses_as_undergrad", "transfer_credit", "graduate",
     "Up to 9 upper-division or 12 graduate units (max 12 total) taken as an undergraduate can count toward a graduate program if not used for the bachelor's degree.",
     {"max_upper_division": 9, "max_graduate": 12, "max_total": 12}, GRADADM,
     "Up to **9 units of upper-division** or up to **12 units of graduate work** (not to exceed a total of 12 units) completed as an undergraduate may be counted toward a graduate program ONLY if the work was taken before the bachelor’s degree was earned and not counted toward the undergraduate degree."),
    ("scholars_units", "graduation_units", "graduate",
     "SF State Scholars (combined bachelor's + master's) requires at least 150 units total (120 + 30).",
     {"min_units": 150}, GRADPOL,
     "The minimum unit requirement to obtain both undergraduate and graduate degrees is 150 units (120 units and 30 units, respectively)."),

    # ---------------------------------------------------------------- course numbering
    ("course_numbering", "course_numbering", "all",
     "Course numbers: 0-99 remedial/non-credit (don't count toward graduation), 100-299 lower-division, 300-699 upper-division, 700-899 graduate, 900-999 doctoral, 9000-9999 professional CEU.",
     {"remedial": [0, 99], "lower_division": [100, 299], "upper_division": [300, 699], "graduate": [700, 899],
      "doctoral": [900, 999], "ceu": [9000, 9999]}, TERMS,
     "The following course numbering system is used at this University:"),
    ("prereq_asterisk", "course_numbering", "all",
     "An asterisk (*) after a prerequisite means it is enforced at registration; others may be enforced by the instructor through add/drop.",
     {}, TERMS,
     'An "*" denotes that a course prerequisite is enforced at the time of registration.'),
    ("cross_listed", "course_numbering", "all",
     "A cross-listed course can't be taken for credit a second time under another prefix.",
     {}, TERMS,
     "Students may not earn credit in a cross-listed course a second time under an alternate prefix."),
]


def norm(s):
    s = s.replace("**", "").replace("\xa0", " ")
    s = s.replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"').replace("–", "-").replace("—", "-")
    return re.sub(r"\s+", " ", s).strip()


def main():
    pages = {p["id"]: p for p in json.load(open(os.path.join(DATA, "policies.json")))}
    out, missing = [], []
    for rid, cat, applies, rule, values, src, quote in RULES:
        page = pages[src]
        hit_section = None
        for t in page["tabs"]:
            for s in t["sections"]:
                hay = norm(" ".join(s["heading_path"]) + " " + s["text"])
                if norm(quote) in hay:
                    hit_section = " > ".join(s["heading_path"])
                    break
            if hit_section is not None:
                break
        if hit_section is None:
            missing.append((rid, src, quote))
            continue
        out.append({
            "id": rid,
            "category": cat,
            "applies_to": applies,
            "rule": rule,
            "values": values,
            "source_page": page["title"],
            "source_section": hit_section,
            "source_url": page["url"],
            "quote": quote.replace("**", ""),
        })
    if missing:
        for m in missing:
            print("QUOTE NOT FOUND:", m)
        sys.exit(1)
    doc = {
        "bulletin": "San Francisco State University Bulletin 2026-2027",
        "note": "Curated digest. Every rule includes a verbatim quote from the linked bulletin page. "
                "Full policy text lives in policies.json.",
        "rules": out,
    }
    with open(os.path.join(DATA, "academic_rules.json"), "w") as f:
        json.dump(doc, f, ensure_ascii=False, indent=1)
    print(f"{len(out)} rules written")


if __name__ == "__main__":
    main()
