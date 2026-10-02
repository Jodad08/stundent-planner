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
READMIT = "undergraduate-admissions/readmission-special-sessions"
TRANSFER = "undergraduate-admissions/transfer-students"
AMINST = "undergraduate-education/american-institutions"
EXAMS = "undergraduate-education/standardized-external-examinations"
MIM = "undergraduate-education/general-education/met-in-major"

# (id, category, applies_to, rule, values, source_page, quote)
RULES = [
    # ---------------------------------------------------------------- graduation units (undergraduate)
    ("ug_units_to_graduate", "graduation_units", "undergraduate",
     "A bachelor's degree (B.A., B.S., or B.Mus.) requires a minimum of 120 semester units.",
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
     "GE Area 1 (English Communication): at least 9 units, 3 each in 1A English Composition, 1B Critical Thinking, 1C Oral Communication. Every Area 1 course needs CR or C- or better.",
     {"area": "1", "min_units": 9, "min_grade": "C-"}, LDGE,
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
    ("ug_complementary_studies_exempt", "major", "undergraduate",
     "Complementary Studies is automatically met by completing two majors or a major plus a minor, and isn't required for B.Mus. or B.S. degrees.",
     {}, COMP,
     "Students who complete two majors or a major and a minor automatically complete the Complementary Studies requirement."),
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
     "Undergraduates can register for at most 19 units in a fall or spring semester (up to 8 of them wait-listed). Going above this cap needs the Exceed Maximum Units Petition.",
     {"max_units": 19, "max_waitlisted_units": 8}, PP,
     "During priority registration, students may register for a maximum of 19 units of enrolled, including 8 units of wait-listed courses."),
    ("grad_max_units_registration", "unit_load", "graduate",
     "Graduate students can register for at most 16 units, including up to 9 wait-listed units.",
     {"max_units": 16, "max_waitlisted_units": 9}, PP,
     "Graduate students may register for a maximum of 16 units of enrolled, including 9 units of wait-listed courses."),
    ("ug_max_units_academic_notice", "unit_load", "undergraduate",
     "Undergraduates on academic notice may enroll in at most 13 units per semester while their GPA is below 2.0. An advisor can approve an exception by petition.",
     {"max_units": 13}, PP,
     "Undergraduate students on academic notice may enroll in a maximum of 13 units (this does not go into effect until a student’s second semester on academic notice).",
     {"conflicts": [{"source_page": STANDARDS, "quote": "can enroll in a maximum of 13 units per semester while their GPA is below 2.0",
                     "note": "The Academic Standards page applies the cap while the GPA is below 2.0 and doesn't mention the second-semester start."}]}),
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
    ("pell_enrollment_status", "unit_load", "undergraduate",
     "For the Pell Grant: full-time = 12 units, three-quarter time = 9-11, half-time = 6-8 (award prorated). Other aid programs set their own unit rules.",
     {"full_time": 12, "three_quarter": [9, 11], "half_time": [6, 8]}, FA,
     "Enrollment requirement: full time = 12 units; three-quarter time = 9-11 units; half-time = 6-8 units."),
    ("grad_full_time", "unit_load", "graduate",
     "Graduate full-time in fall/spring: 6.1+ units for fee purposes, 8+ for financial aid and international students; typical load 9-12.",
     {"fees": 6.1, "financial_aid": 8, "international": 8, "typical": [9, 12]}, GRADREG,
     "For those receiving financial aid, 8 units and above"),
    ("grad_max_units", "unit_load", "graduate",
     "Graduate maximum with advisor permission is 16 units; more than 16 needs GPA 3.25+ and a petition. In general a post-baccalaureate student can't exceed 18 units, except in cohorted professional programs.",
     {"max_units": 16, "petition_min_gpa": 3.25, "general_max": 18}, GRADREG,
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
     "Week 13 to end of instruction: withdrawal only for circumstances clearly beyond the student's control (e.g., accident, serious illness) when an Incomplete isn't practicable, with documentation and instructor, chair and dean approval. These late withdrawals don't count toward the 18-unit limit.",
     {"from_week": 13}, PP,
     "where the cause of withdrawal is due to circumstances clearly beyond the student's control and the assignment of an Incomplete is not practicable."),
    ("ug_withdraw_limit", "withdrawal", "undergraduate",
     "Undergraduates may withdraw from at most 18 units over their entire SF State career. Withdrawing from a whole semester, CPaGE classes, and late withdrawals approved for circumstances beyond the student's control don't count.",
     {"max_units": 18}, PP,
     "Undergraduates may withdraw from a maximum of 18 units throughout their entire SF State undergraduate career (see Grading Policy)."),
    ("withdraw_deadline", "withdrawal", "all",
     "All withdrawal requests must be submitted by the last day of instruction.",
     {}, PP,
     "Academic Policy requires that all requests to withdraw from a course must be submitted no later than the last day of instruction of that term."),
    ("ug_withdraw_limit_exclusions", "withdrawal", "undergraduate",
     "Total-semester withdrawals and classes taken through CPaGE don't count toward the 18-unit withdrawal limit.",
     {}, GRADING,
     "This does not include total semester withdrawals of all courses or classes taken in CPaGE"),
    ("readmission_absence", "registration", "undergraduate",
     "Undergraduates who are away too long must apply for readmission. The bulletin is inconsistent: the policies page says three consecutive semesters (excluding summer); the readmission page says two. Plan on two to be safe and confirm with the Registrar.",
     {"semesters_policies_page": 3, "semesters_readmission_page": 2}, PP,
     "Students who do not enroll for three consecutive semesters (excluding summer) must apply for readmission to the University.",
     {"conflicts": [{"source_page": READMIT, "quote": "must apply for readmission if they have been absent for two consecutive semesters",
                     "note": "The readmission page says two consecutive semesters."}]}),
    ("grad_readmission_absence", "registration", "graduate",
     "Graduate students who leave for two or more consecutive semesters (not counting summer), or attend another college meanwhile, must reapply through Cal State Apply and to their program.",
     {"semesters": 2}, GRADREG,
     "Students who leave the University for two or more consecutive semesters (not including summer session)"),
    ("audit", "registration", "all",
     "Auditors pay the same fees; switching audit to credit must happen by the add deadline; credit to audit isn't allowed after week 2 per the policies page (the grading page's AU definition says week 3).",
     {}, PP,
     "A student who is enrolled for credit may not change to audit after the second week of instruction.",
     {"conflicts": [{"source_page": GRADING, "quote": "after the third week",
                     "note": "The AU grade definition on the grading page says the third week."}]}),
    ("leave_of_absence", "registration", "all",
     "Continuing students can be absent up to two consecutive fall/spring semesters and keep continuing status; longer absences need a Planned Educational Leave (up to two academic years), which must be for something relevant to the program. For undergraduates, health, financial and personal reasons aren't accepted; the graduate rules differ (see the graduate policies page).",
     {"max_semesters_without_leave": 2, "max_leave_years": 2}, PP,
     "Continuing students can be absent up to two consecutive fall or spring semesters during a specific academic year and maintain their eligibility."),
    ("leave_reasons", "registration", "undergraduate",
     "A Planned Educational Leave isn't granted for health, financial, or other personal reasons, or to attend another school; those students reapply for admission instead.",
     {}, PP,
     "Requests for health, financial, or other personal reasons, or matriculation at another institution are not recognized for the purpose of granting a leave of absence."),

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
     "Graduate students can repeat a course graded below B- (or IC, W, WU) once, if the program permits. Both grades stay on the transcript and are averaged. (The general policies page says 'lower than B', so a B- is ambiguous.)",
     {"repeat_if_below": "B-", "max_additional_attempts": 1}, GRADPOL,
     "A graduate student who has received a grade of B– or better, or a grade of CR, may not repeat a course unless the course is described in the current SF State Bulletin as repeatable for credit.",
     {"conflicts": [{"source_page": PP, "quote": "Graduate students who receive a grade lower than B",
                     "note": "The policies page sets the repeat threshold at lower than B."}]}),

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
     "Only students already on academic notice or subject to disqualification can be disqualified. It happens before the next fall/spring term when the term GPA is below 2.0 AND the SF State or combined cumulative GPA is below the class-level floor: 1.50 freshman (<30 units), 1.70 sophomore (30-59), 1.85 junior (60-89), 1.95 senior (90+). Freshmen get an extra (third) semester first. A term GPA of 2.0+ prevents disqualification.",
     {"freshman": 1.50, "sophomore": 1.70, "junior": 1.85, "senior": 1.95}, STANDARDS,
     "Undergraduate students on academic notice or subject to disqualification are academically disqualified"),
    ("ug_readmission_after_dq", "academic_standing", "undergraduate",
     "Disqualified students must raise SF State and combined GPAs to 2.0 (SF State GPA via Open University). Within one year they can ask the Registrar for reinstatement; after more than two semesters they must apply for admission again.",
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
     "Graduate students need a 3.0 GPA in all post-baccalaureate SF State work and on the Advancement to Candidacy (ATC); non-supervisory ATC courses need B- or better. (Another section lists A through C and CR as acceptable on the ATC; programs may require B or better.)",
     {"min_gpa": 3.0, "min_atc_course_grade": "B-"}, GRADPOL,
     "All non-supervisory courses listed on the ATC must have a grade of B- or higher.",
     {"conflicts": [{"source_page": GRADPOL, "quote": "Only the grades of A, A–, B+, B, B–, C+, C, and CR are acceptable",
                     "note": "The Satisfactory Scholarship section lists C+ and C as acceptable on the ATC."}]}),
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
     "Up to 9 upper-division or 12 graduate units (max 12 total) taken as an undergraduate can count toward a graduate program if not used for the bachelor's degree, and only units graded B or better.",
     {"max_upper_division": 9, "max_graduate": 12, "max_total": 12}, GRADADM,
     "Up to **9 units of upper-division** or up to **12 units of graduate work** (not to exceed a total of 12 units) completed as an undergraduate may be counted toward a graduate program ONLY if the work was taken before the bachelor’s degree was earned and not counted toward the undergraduate degree."),
    ("scholars_units", "graduation_units", "graduate",
     "SF State Scholars (combined bachelor's + master's) requires at least 150 units total (120 + 30).",
     {"min_units": 150}, GRADPOL,
     "The minimum unit requirement to obtain both undergraduate and graduate degrees is 150 units (120 units and 30 units, respectively)."),

    # ---------------------------------------------------------------- added after verification
    ("ug_ge_area2_grade", "general_education", "undergraduate",
     "GE Area 2 (quantitative reasoning) courses need CR or C- or better.",
     {"area": "2", "min_grade": "C-"}, LDGE,
     "Area 2 courses must be completed with a grade of CR or C- or better to fulfill the General Education requirement."),
    ("ug_ge_area4", "general_education", "undergraduate",
     "The three Area 4 courses (two lower-division, one upper-division) must span at least two disciplines; first-time freshmen take one lower-division Area 4 course that meets U.S. History.",
     {"area": "4"}, LDGE,
     "must be in at least two different disciplines"),
    ("catalog_rights", "catalog_rights", "undergraduate",
     "With continuous attendance, students may choose the graduation requirements in effect when they began study, when they entered SF State, or when they graduate.",
     {"options": ["began study", "entered SF State", "graduate"]}, PP,
     "elect to meet the graduation requirements for San Francisco State University in effect"),
    ("continuous_attendance", "catalog_rights", "undergraduate",
     "Continuous attendance (for catalog rights) means attending at least one semester or two quarters each calendar year.",
     {}, PP,
     "Continuous attendance"),
    ("ug_transfer_total_cap", "transfer_credit", "undergraduate",
     "No more than 90 semester units may be transferred in from all sources combined (because 30 units must be earned in residence).",
     {"max_units": 90}, TRANSFER,
     "no more than a total of 90 semester (135 quarter) units may be transferred into the university from all sources"),
    ("cal_getc", "transfer_credit", "undergraduate",
     "California Community Colleges can certify up to 34 semester units of Cal-GETC, which fulfills lower-division GE.",
     {"max_units": 34}, TRANSFER,
     "can certify up to 34 semester (45 quarter) units of General Education Transfer Curriculum (Cal-GETC)"),
    ("double_major", "major", "undergraduate",
     "Students may complete two majors; courses that clearly overlap can count for both, but units count once toward 120. Apply for both in one degree application.",
     {}, MAJORS,
     "Students who complete two majors may count the same courses for both majors where there is a clearly stated overlap in the Bulletin requirements."),
    ("double_major_diploma", "graduation", "undergraduate",
     "Double majors in the same degree type (e.g. two B.A. majors) get one degree and one diploma, with one $100 application fee.",
     {"fee": 100}, GRAD,
     "Double majors leading to the same baccalaureate degree"),
    ("minor_overlap", "minor", "undergraduate",
     "Courses may count toward both a major and a minor where the bulletin shows overlap (units count once). Minor and GE courses can overlap without limit.",
     {}, MINORS,
     "Courses may count for both a major and a minor where there is a clearly stated overlap in the Bulletin requirements."),
    ("second_bachelors", "graduation", "undergraduate",
     "Students who already hold a bachelor's degree and are admitted for a second one only complete the new major's courses, not GE or other graduation requirements.",
     {}, UGED,
     "will not have to complete any GE or additional graduation requirements"),
    ("graduation_reapply", "graduation", "undergraduate",
     "Students who don't finish in the term they applied for must reapply for graduation and pay the $100 fee again.",
     {"fee": 100}, GRAD,
     "Students will need to reapply for graduation, pay the $100 application for graduation fee"),
    ("cr_nc_major_limit", "grading", "undergraduate",
     "Departments may limit how many major courses can be taken CR/NC.",
     {}, GRADING,
     "Departments may limit the number of courses in a major that can be graded CR/NC."),
    ("third_attempt", "repeat", "all",
     "Taking a course a third time or more requires the instructor's and department chair's consent (sometimes the dean or the Board of Appeals and Review too).",
     {}, PP,
     "Exceptions to repeat a course for 3 or more times require the consent of the instructor and department chair in which the course is offered."),
    ("academic_renewal", "academic_standing", "undergraduate",
     "Academic renewal can disregard up to two semesters of old work if 5 years have passed and the student has since earned 15 units at 3.0, 30 at 2.5, or 45 at 2.0 in residence.",
     {"years_elapsed": 5, "options": [[15, 3.0], [30, 2.5], [45, 2.0]]}, STANDARDS,
     "Five years have elapsed since the most recent work to be disregarded was completed"),
    ("admin_disqualification_continuous", "academic_standing", "undergraduate",
     "Students on continuous academic notice or subject to disqualification for three semesters (not counting summer) may be administratively disqualified.",
     {"semesters": 3}, STANDARDS,
     "Students who have been on continuous academic notice and/or subject to disqualification for three continuous semesters may be administratively disqualified at the end of their third semester."),
    ("admin_notice_nc", "academic_standing", "all",
     "Repeated failure to progress, including 15 units of No Credit, can lead to administrative academic notice.",
     {"nc_units": 15}, STANDARDS,
     "including that resulting from assignment of 15 units of No Credit"),
    ("ap_us_history", "american_institutions", "undergraduate",
     "An AP U.S. History score of 3+ satisfies the U.S. History requirement; no AP exam satisfies California state and local government.",
     {"min_score": 3}, AMINST,
     "A score of 3 or higher on the Advanced Placement examination in U.S. History will satisfy the U.S. History requirement"),
    ("exam_duplicate_credit", "transfer_credit", "undergraduate",
     "Exam credit (AP/IB/CLEP) isn't awarded twice for equivalent exams or coursework.",
     {}, EXAMS,
     "will not be awarded duplicate credit"),
    ("credit_by_exam", "transfer_credit", "undergraduate",
     "Credit by examination is undergraduate-only, capped at 30 units (6 of which can count as residence), and requires enrollment in at least one other course.",
     {"max_units": 30, "max_residence_units": 6}, PP,
     "Only undergraduate credit may be earned with a maximum limit of 30 units, 6 of which can be earned for residence credit."),
    ("concurrent_enrollment_load", "unit_load", "all",
     "Units taken at all schools combined in a term can't exceed SF State's maximum unit load without advance written approval from the appropriate dean.",
     {}, PP,
     "Under no circumstances is the total unit load for all course registrations in all institutions being attended to exceed the maximum unit load restrictions"),
    ("met_in_major", "general_education", "undergraduate",
     "Some majors satisfy specific GE areas ('met in the major') once the listed courses are completed, whether or not the student finishes the major.",
     {}, MIM,
     "This is true whether or not the student completes the major."),
    ("seniors_grad_courses", "registration", "undergraduate",
     "Seniors may enroll in graduate courses only with the instructor's special permission.",
     {}, GRAD,
     "Seniors may enroll in graduate courses only with special permission of the instructor."),
    ("census_attendance", "registration", "all",
     "To count as attending a semester, a student must be enrolled in at least one class on the 20th day of instruction (10th day of each summer session).",
     {"census_day": 20}, PP,
     "must be reported as enrolled in at least one class on the 20th day of instruction"),
    ("atc_graduate_level", "graduation_units", "graduate",
     "At least 50% of Advancement to Candidacy units must be graduate-level (700-999) courses.",
     {"min_fraction": 0.5}, GRADPOL,
     "Fifty percent (50%) of the units from exclusively graduate-level courses (700-999 level)."),
    ("grad_ce_continuous_enrollment", "time_limit", "graduate",
     "Graduate students who haven't finished their Culminating Experience by the end of the following ('grace') semester must enroll in a zero-unit CPaGE course every semester until they finish.",
     {}, GRADPOL,
     "must enroll in a zero-unit course"),

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


# Student-phrased titles: what someone would ask, used as the search/RAG title of each rule.
TOPICS = {
    "ug_units_to_graduate": "Units needed to graduate with a bachelor's degree (120)",
    "ug_residence_units": "Residence units required at SF State (30)",
    "ug_residence_ud_ge": "Upper-division GE units required in residence (9)",
    "ug_upper_division_units": "Upper-division units required for a bachelor's degree (30)",
    "ug_max_community_college_units": "Maximum community college transfer units (70)",
    "ug_max_extension_units": "Maximum extension and correspondence units (24)",
    "ug_max_exam_units": "Maximum units by exam or evaluation (30)",
    "ug_max_cr_units": "Maximum CR/NC (pass/fail) units toward a bachelor's degree (24)",
    "ug_max_685_units": "Maximum 685 'Projects in Teaching' units (4)",
    "ug_min_gpa_graduation": "Minimum GPA to graduate (2.0)",
    "ug_ge_units": "General Education units required (43)",
    "ug_ge_upper_division": "Upper-division GE requirement (9 units)",
    "ug_ge_ud_prereqs": "Prerequisites for upper-division GE courses",
    "ug_ge_area1": "GE Area 1 English Communication requirement and minimum grade",
    "ug_ge_area3": "GE Area 3 Arts and Humanities requirement",
    "ug_ge_area5": "GE Area 5 Physical and Biological Sciences requirement",
    "ug_ge_table": "GE requirements by area (units per area)",
    "ug_gwar": "Graduation Writing Assessment Requirement (GWAR, GW courses)",
    "ug_sf_state_studies": "SF State Studies requirement (AERM, ESCA, GP, SJ)",
    "ug_american_institutions": "American Institutions requirement (U.S. History and Government)",
    "ug_complementary_studies": "Complementary Studies requirement for B.A. degrees (12 units)",
    "ug_complementary_studies_exempt": "Who is exempt from Complementary Studies",
    "ug_declare_major": "Deadline to declare a major (70 units)",
    "ug_major_gpa": "Minimum GPA in the major (2.0)",
    "ug_major_ge_double_count": "Can a GE course also count for my major",
    "ug_change_major_catalog": "Which requirements apply after changing majors",
    "ug_minor_min_units": "Minor requirements: minimum units, residence, GPA",
    "ug_minor_residence": "Minor units that must be taken at SF State",
    "ug_time_limit": "Time limit for undergraduate degree courses (seven-year rule)",
    "class_levels": "Class level by units: freshman, sophomore, junior, senior",
    "ug_average_load": "Average full-time undergraduate course load (15 units)",
    "normal_load": "Normal course load per semester (undergraduate and graduate)",
    "ug_max_units_priority_registration": "Maximum units per semester for undergraduates (19)",
    "grad_max_units_registration": "Maximum units per semester at registration for graduate students (16)",
    "ug_max_units_academic_notice": "Maximum units per semester on academic notice/probation (13)",
    "ug_max_units_summer": "Maximum summer session units for undergraduates",
    "ug_exceed_max_units": "How to take more than the maximum units (Exceed Maximum Units Petition)",
    "ug_25_units": "Taking 25 or more units in a semester",
    "intl_min_units": "Minimum units per semester for international (F-1) students",
    "pell_enrollment_status": "Full-time, three-quarter and half-time units for the Pell Grant",
    "grad_full_time": "Full-time units for graduate students",
    "grad_max_units": "Maximum units per semester for graduate students (16, petition above)",
    "grad_max_units_summer": "Maximum summer units for graduate students",
    "va_full_time": "Full-time units for VA education benefits",
    "add_deadline": "Deadline to add a class (first three weeks, permission number)",
    "drop_first_three_weeks": "Deadline to drop a class without a W (first three weeks)",
    "withdraw_weeks_4_12": "Withdrawing from a class in weeks 4-12 (W grade)",
    "withdraw_week_13_on": "Withdrawing from a class after week 12 (serious circumstances only)",
    "ug_withdraw_limit": "Withdrawal limit: 18 units over your SF State career",
    "ug_withdraw_limit_exclusions": "What doesn't count toward the 18-unit withdrawal limit",
    "withdraw_deadline": "Last day to request a withdrawal",
    "readmission_absence": "When you must apply for readmission after not enrolling",
    "grad_readmission_absence": "Readmission for graduate students after time away",
    "audit": "Auditing a class",
    "leave_of_absence": "Leave of absence (Planned Educational Leave)",
    "leave_reasons": "Reasons not accepted for an undergraduate leave of absence",
    "grade_points": "Grade points per letter grade (GPA scale)",
    "gpa_formula": "How GPA is calculated",
    "cr_definition": "What a CR (credit) grade means",
    "grading_option_deadline": "Deadline to switch to CR/NC (pass/fail) grading",
    "grad_cr_limit": "CR/NC limit for master's degrees (30% of ATC units)",
    "incomplete": "Incomplete (I) grade rules and deadline",
    "wu_grade": "What a WU (unauthorized withdrawal) grade means",
    "ug_repeat_rules": "How many times can I repeat a course",
    "ug_grade_forgiveness": "Grade forgiveness when repeating a course (16 units)",
    "ug_repeat_cap": "Maximum units of repeated courses (28)",
    "repeat_default": "Can a course be repeated for more credit",
    "grad_repeat": "Repeating a course as a graduate student",
    "ug_good_standing": "Good academic standing (GPA 2.0)",
    "ug_academic_notice": "Academic notice (probation) for GPA below 2.0",
    "ug_disqualification": "Academic disqualification GPA thresholds by class level",
    "ug_readmission_after_dq": "Returning after academic disqualification",
    "deans_list": "Dean's List requirements (GPA 3.25, 12 units)",
    "latin_honors": "Graduation honors GPA: cum laude, magna cum laude, summa cum laude",
    "grad_min_units": "Minimum units for master's and doctoral degrees",
    "grad_gpa": "Minimum GPA for graduate students and ATC course grades",
    "grad_standing": "Graduate academic probation (GPA below 3.0)",
    "grad_seven_year_limit": "Time limit to finish a master's degree (seven years)",
    "grad_progress": "Minimum progress for graduate students (6 units a year)",
    "grad_residence": "Residence units for a master's degree (21 of 30)",
    "grad_transfer_units": "Transfer units allowed toward a master's degree (9)",
    "grad_open_university": "Open University units allowed toward a master's degree (6)",
    "ug_grad_courses_as_undergrad": "Using courses taken as an undergraduate toward a graduate degree",
    "scholars_units": "SF State Scholars combined bachelor's and master's units (150)",
    "course_numbering": "Course numbering: lower-division, upper-division, graduate",
    "prereq_asterisk": "What the * after a prerequisite means",
    "cross_listed": "Cross-listed courses can't be taken twice",
    "ug_ge_area2_grade": "GE Area 2 math/quantitative reasoning minimum grade",
    "ug_ge_area4": "GE Area 4 Social and Behavioral Sciences rules",
    "catalog_rights": "Catalog rights: which bulletin's requirements apply to me",
    "continuous_attendance": "Continuous attendance definition for catalog rights",
    "ug_transfer_total_cap": "Maximum total transfer units from all sources (90)",
    "cal_getc": "Cal-GETC certification for transfer students",
    "double_major": "Double major rules",
    "double_major_diploma": "Double major: one degree, one diploma, one fee",
    "minor_overlap": "Can courses count for both my major and minor",
    "second_bachelors": "Second bachelor's degree requirements",
    "graduation_reapply": "Reapplying for graduation if you don't finish",
    "cr_nc_major_limit": "CR/NC limits in the major",
    "third_attempt": "Taking a course a third time",
    "academic_renewal": "Academic renewal (removing old grades from GPA)",
    "admin_disqualification_continuous": "Administrative disqualification after three semesters on notice",
    "admin_notice_nc": "Administrative academic notice for 15 units of No Credit",
    "ap_us_history": "AP U.S. History credit for American Institutions",
    "exam_duplicate_credit": "No duplicate credit for AP/IB/CLEP and coursework",
    "credit_by_exam": "Credit by examination (challenge a course)",
    "concurrent_enrollment_load": "Taking classes at another school at the same time (unit load)",
    "met_in_major": "GE 'met in the major'",
    "seniors_grad_courses": "Can seniors take graduate courses",
    "census_attendance": "Census date: when you count as enrolled (20th day)",
    "atc_graduate_level": "Graduate-level units required on the ATC (50%)",
    "grad_ce_continuous_enrollment": "Continuous enrollment while finishing a thesis/culminating experience",
}


def norm(s):
    s = s.replace("**", "").replace("\xa0", " ")
    s = s.replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"').replace("–", "-").replace("—", "-")
    return re.sub(r"\s+", " ", s).strip()


def flex_pattern(anchor):
    """Regex that finds `anchor` in original text despite whitespace, quote-style and dash differences."""
    out = []
    for ch in norm(anchor):
        if ch == " ":
            out.append(r"\s+")
        elif ch == "'":
            out.append("['’‘]")
        elif ch == '"':
            out.append('["“”]')
        elif ch == "-":
            out.append("[-–—]")
        else:
            out.append(re.escape(ch))
    return re.compile("".join(out))


def locate(page, anchor):
    """(section_path, full sentence(s) containing anchor, section excerpt) or None."""
    pat = flex_pattern(anchor)
    for t in page["tabs"]:
        for s in t["sections"]:
            text = s["text"].replace("**", "")
            full = " ".join(s["heading_path"]) + "\n" + text
            m = pat.search(text)
            if not m:
                if pat.search(full):
                    return " > ".join(s["heading_path"]), norm(anchor), text[:2500]
                continue
            # expand to sentence boundaries within the same line/paragraph
            stops = [i for i in (mm.start() for mm in re.finditer(r"\. ", text))
                     if not re.search(r"(?:\b[A-Z]|\be\.g|\bi\.e|\betc|\bvs|\bNo|\bSt)$", text[:i])]
            left = max([i + 2 for i in stops if i + 2 <= m.start()] + [text.rfind("\n", 0, m.start()) + 1, 0])
            right_candidates = [i + 1 for i in stops if i >= m.end() - 1] + \
                [i for i in (text.find("\n", m.end()),) if i != -1]
            right = min(right_candidates) if right_candidates else len(text)
            sentence = re.sub(r"^[-*\d.\s|]+", "", text[left:right]).strip()
            return " > ".join(s["heading_path"]), re.sub(r"\s+", " ", sentence), text[:2500]
    return None


def main():
    pages = {p["id"]: p for p in json.load(open(os.path.join(DATA, "policies.json")))}
    out, missing = [], []
    ids = set()
    for entry in RULES:
        rid, cat, applies, rule, values, src, quote = entry[:7]
        extras = entry[7] if len(entry) > 7 else {}
        assert rid not in ids, f"duplicate rule id {rid}"
        ids.add(rid)
        page = pages[src]
        hit = locate(page, quote)
        if hit is None:
            missing.append((rid, src, quote))
            continue
        section, sentence, excerpt = hit
        rec = {
            "id": rid,
            "topic": TOPICS.get(rid, rule.split(".")[0][:90]),
            "category": cat,
            "applies_to": applies,
            "rule": rule,
            "values": values,
            "source_page": page["title"],
            "source_section": section,
            "source_url": page["url"],
            "quote": sentence,
            "source_excerpt": excerpt,
        }
        for c in extras.get("conflicts", []):
            other = pages[c["source_page"]]
            ohit = locate(other, c["quote"])
            if ohit is None:
                missing.append((rid + " (conflict)", c["source_page"], c["quote"]))
                continue
            rec.setdefault("conflicts", []).append({
                "note": c["note"], "source_page": other["title"], "source_section": ohit[0],
                "source_url": other["url"], "quote": ohit[1]})
        out.append(rec)
    if missing:
        for m in missing:
            print("QUOTE NOT FOUND:", m)
        sys.exit(1)
    doc = {
        "bulletin": "San Francisco State University Bulletin 2026-2027",
        "note": "Curated digest. Each rule has a verbatim quote (the full sentence it comes from), the source "
                "section text as evidence, and any conflicting statement elsewhere in the bulletin. "
                "Full policy text lives in policies.json.",
        "rules": out,
    }
    with open(os.path.join(DATA, "academic_rules.json"), "w") as f:
        json.dump(doc, f, ensure_ascii=False, indent=1)
    print(f"{len(out)} rules written ({sum(1 for r in out if r.get('conflicts'))} with documented conflicts)")


if __name__ == "__main__":
    main()
