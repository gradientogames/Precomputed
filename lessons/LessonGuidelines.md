# Guidelines for writing lessons
- Lesson stages (use for lessons teaching new concepts, but feel free to diverge from this format for certain lessons): Challenge -> Introduce -> Teach use -> Concept (how it works) -> Final Challenge -> Reflection.
  - Each stage should have several elements and lots of text. Use a variety of elements.
- Elements:
  - Text elements should be several sentences long (at least 4).
  - Answers for multiple-choice-quiz's should have as short answer text as possible.
  - For code-quiz's, minimise the amount of code the user can edit, such as putting all imports into the code prefix, or put a method definition in the prefix and suffix code.
- Language focuses:
  - For python: base lesson around teaching literally only python.
  - For C#: base lesson around teaching programming.
  - For C: base lesson around teaching (low-level) computer science.
- Writing voice: Use active voice Instead of: "The meeting was canceled by management." Use: "Management canceled the meeting." Address readers directly with "you" and "your" Example: "You'll find these strategies save time." Be direct and concise Example: "Call me at 3pm." Use simple language Example: "We need to fix this problem." Stay away from fluff Example: "The project failed." Focus on clarity Example: "Submit your expense report by Friday." Vary sentence structures (short, medium, long) to create rhythm Example: "Stop. Think about what happened. Consider how we might prevent similar issues in the future." Maintain a natural/conversational tone Example: "But that's not how it works in real life." Keep it real Example: "This approach has problems." Avoid marketing language Avoid: "Our cutting-edge solution delivers unparalleled results." Use instead: "Our tool can help you track expenses." Simplify grammar Example: "yeah we can do that tomorrow." Avoid AI-philler phrases Avoid: "Let's explore this fascinating opportunity." Use instead: "Here's what we know." Avoid (important!): Clichés, jargon, hashtags, semicolons, emojis, and asterisks, dashes Instead of: "Let's touch base to move the needle on this mission-critical deliverable." Use: "Let's meet to discuss how to improve this important project." Conditional language (could, might, may) when certainty is possible Instead of: "This approach might improve results." Use: "This approach improves results." Redundancy and repetition (remove fluff!) ABSOLUTELY NO EM DASHES! Instead of "—" Use ","

## Lesson JSON schema
This app renders lessons from static JSON files under public/lessons. The manifest is public/lessons/manifest.json and each lesson file must contain at least:
- title: string
- description: string
- content: LessonElement[]

Content elements supported:
- Text block:
  { "type": "text", "text": string }
- Multiple-choice quiz:
  {
  "type": "multiple-choice-quiz",
  "question": string,
  "options": [{ id: string, text: string, correct?: boolean }],
  "explanation"?: string
  }
- Code quiz:
  {
  "type": "code-quiz",
  "language"?: "python" | "c" | "csharp",
  "prompt": string,
  "starterCode"?: string,          // editable middle code provided to the learner
  "prefixCode"?: string,           // uneditable code prepended at run time
  "suffixCode"?: string,           // uneditable code appended at run time
  "desiredOutput"?: DesiredOutput, // passing criteria (see below)
  "maxLines"?: number,             // -1 means unlimited
  "maxStringLength"?: number       // -1 means unlimited
  }

Uneditable prefix/suffix behavior
- If prefixCode/suffixCode are provided, the interpreter reconstructs the final code as: prefixCode + learnerCode + suffixCode. If the learner manually alters prefix/suffix in the editor, they are ignored at run time and the enforced prefix/suffix are used.
- The UI displays prefix/suffix in separate read-only code blocks above and below the editable editor. Line numbers correspond to the editable area only. Syntax highlighting applies to the read-only blocks and the editor.

DesiredOutput strategies (union type)
- none: no specific output is required; the quiz does not gate Continue/Finish.
  { "type": "none" }
- exact: output must exactly equal the provided string (after normalizing newlines and trimming trailing newlines).
  { "type": "exact", "value": "7 3" }
- text: output should only contain the provided string (surrounding whitespace is ignored).
  { "type": "text", "value": "7 3" }
- error: the run must yield an error (compile/runtime) and is considered correct if an error is reported.
  { "type": "error" }
- pointer: output must contain a pointer-like hex address (e.g., 0x7ffe...). Useful for C %p exercises.
  { "type": "pointer" }
- text+tokens: output must include the given text AND the submitted source must include all listed tokens (simple substring checks).
  { "type": "text+tokens", "text": "done", "sourceIncludes": ["&value", "*ptr"] }

Skippable desiredOutput
- Any desiredOutput object may include an optional flag: { "skippable": true }.
- When skippable is true, the quiz will not block Continue/Finish based on correctness, but the learner must run the code at least once. Continue/Finish remain disabled until a run completes and output is received.

Examples
- Python hello world:
  {
  "type": "code-quiz",
  "language": "python",
  "prompt": "Print Hello from Python! to the console.",
  "starterCode": "print('Hello from Python!')",
  "prefixCode": "",
  "suffixCode": "",
  "desiredOutput": { "type": "exact", "value": "Hello from Python!" }
  }
- C pointer address:
  {
  "type": "code-quiz",
  "language": "c",
  "prompt": "Print the memory address of a variable using & and the value.",
  "starterCode": "#include <stdio.h>\nint main(){ int x=42; /* ... */ }",
  "desiredOutput": { "type": "pointer" }
  }
