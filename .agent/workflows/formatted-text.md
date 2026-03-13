---
description: how to display AI-generated text in the portal — always use FormattedText, never raw markdown
---

# Text Formatting Rule

**All AI-generated text in Mantram AI must be displayed using the `FormattedText` component. No raw markdown symbols (asterisks, hashes, etc.) should ever appear in the portal.**

## Rendering AI Text

Always import and use `FormattedText` from `../components/FormattedText`:

```jsx
import FormattedText from '../components/FormattedText';

// Dark mode (default — for dashboard, studios, overlays)
<FormattedText text={aiGeneratedText} />

// Light mode (for PDF export, print views)
<FormattedText text={aiGeneratedText} light />

// Strip markdown to plain text (tooltips, meta descriptions, etc.)
import { stripMarkdown } from '../components/FormattedText';
const plain = stripMarkdown(aiGeneratedText);
```

## AI Prompts

When writing AI prompts that generate user-facing text, always include this instruction:

```
DO NOT use markdown formatting like #, ##, ###, **, *, ~~, or backticks in text content.
Write clean, plain-language text. Use line breaks for paragraph separation.
No asterisks whatsoever.
```

## Never Do This

```jsx
// ❌ WRONG — raw text with potential markdown symbols
<p>{aiResponse.text}</p>
<div>{content.split('\n').map(p => <p>{p}</p>)}</div>

// ✅ CORRECT — always use FormattedText
<FormattedText text={aiResponse.text} />
```
