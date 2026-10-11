# Pairing preference form

The pairing round collects each mentor's and mentee's top three choices through a Google
Form. The app imports the export and reconciles it. This document is the contract between
the form and the importer. If the question titles change, the import stops working.

## Build the form

Three sections. Mark every choice and reason question required.

Form settings: restrict responses to the school Google Workspace domain, collect verified
email addresses, limit each person to one response, allow response editing, and send
responders a copy of their response so they have their edit link. Switch off "Accepting
responses" at the deadline, because the form does not close itself.

**Section 1: TMC Circle Mentor/Mentee Preference Form**

> Now that you have met at Circle Initiation, tell us who you would like to be paired
> with. The PD team will use your choices to form this year's mentor-mentee pairs.
>
> Please submit by **[due date]**. Fill in your own details below, then choose whether
> you are a mentor or a mentee. You will be taken to the right questions.
>
> If you need to change your choices, use the Edit your response link on the confirmation
> page or in your email copy.

Questions: `Full Name`, `School Email Address`, `School Admin ID`, and a multiple choice
`I am a...` with the answers `Mentor` and `Mentee`. Set the answers to go to Section 2
(Mentor) and Section 3 (Mentee).

**Section 2: Submit Your Mentee Preferences** (mentors). Set "After section" to **Submit
form**, otherwise mentors fall through into Section 3.

> Choose three mentees you would like to be paired with, in order of preference. Each
> choice must be a different person, and all three are required.
>
> Give a short reason for each. If you and a mentee have already agreed to be paired,
> say so in the reason. Your choices are not guaranteed, but they are the main input to
> pairing.

Dropdowns: `First Choice of Mentee`, `Second Choice of Mentee`, `Third Choice of Mentee`.
Short answers: `Reason for First Choice of Mentee`, `Reason for Second Choice of Mentee`,
`Reason for Third Choice of Mentee`.

**Section 3: Submit Your Mentor Preferences** (mentees). Same text as Section 2 with
"mentor" in place of "mentee".

Dropdowns: `First Choice of Mentor`, `Second Choice of Mentor`, `Third Choice of Mentor`.
Short answers: `Reason for First Choice of Mentor`, `Reason for Second Choice of Mentor`,
`Reason for Third Choice of Mentor`.

Google adds `Timestamp` itself, and `Email Address` when verified emails are collected.
The importer needs the 17 headers above. `Email Address` is optional and only produces a
warning if it differs from the roster. Do not rename a question once responses exist.

## Fill the dropdowns

On the import page (Members, then Import responses) download the two name lists. The
mentee list is for the three dropdowns in Section 2, the mentor list for Section 3.
Pasting a newline-separated list into the first option box should create one option per
line. Try it on one dropdown first. The names come straight from the roster, so the
dropdowns and the importer agree. If the roster changes after the form is live, download
the lists again and update the dropdowns. A response naming someone who is no longer on the
roster is skipped as a whole, and the person's existing choices are kept, so ask them to
edit their response.

Two people in the same role with the same name make a choice ambiguous. The import
refuses until the roster names are distinct.

## Import

1. In the form's Responses tab, download the responses as a CSV file. Each person has one
   row, and edits update it in place. If a file ever holds two rows for one person, the later
   row wins, so do not sort the sheet. If the download is a zip, unzip it and upload the CSV
   inside.
2. On the import page, upload the file and validate. The report shows how many responses
   will be imported or replaced, which were skipped and why, warnings for a typed name or
   email that differs from the roster, and who has no choices yet.
3. Confirm. You can import again as more responses arrive. Each person's choices are
   replaced by their latest row in the file, if it is valid. An invalid row is skipped and
   the person's existing choices are kept. People not in the file are left alone.
4. When the deadline passes, close the form on the Members page. That saves the baseline
   and builds the pairings. Closing blocks further imports until the form is reopened.

Respondents are identified by `School Admin ID`, compared ignoring leading zeros so an ID
that a spreadsheet stripped still matches.
