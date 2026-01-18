/**
 * Test: Empty paired tags treated as void elements
 * Verifies that empty tags like FA icons become [HV1] instead of [HE1][/HE1]
 * Also tests whitespace-only tags becoming void with whitespace extracted
 *
 * Run with: npx tsx test/empty-tags.ts
 */

import { htmlToPlaceholders, placeholdersToHtml } from '../apps/translate/src/fetch/dom-placeholders.js'

interface TestCase {
  name: string
  input: string
  expectedText: string
  expectedReplacements: number
  expectedRestored?: string // If different from input (e.g., whitespace moved outside tag)
}

const testCases: TestCase[] = [
  // === Truly empty tags → void ===
  {
    name: '1. Font Awesome icon (empty <i>)',
    input: 'Click the <i class="fas fa-user"></i> icon.',
    expectedText: 'Click the [HV1] icon.',
    expectedReplacements: 1,
  },
  {
    name: '2. Normal italic with text',
    input: 'This is <i>important</i> text.',
    expectedText: 'This is [HE1]important[/HE1] text.',
    expectedReplacements: 1,
  },
  {
    name: '3. Mixed - FA icon and text formatting',
    input: 'Click <i class="fas fa-save"></i> to <i>save</i> work.',
    expectedText: 'Click [HV1] to [HE1]save[/HE1] work.',
    expectedReplacements: 2,
  },
  {
    name: '4. Empty span',
    input: 'Text<span class="spacer"></span>more.',
    expectedText: 'Text[HV1]more.',
    expectedReplacements: 1,
  },
  {
    name: '5. Nested icon inside link',
    input: '<a href="/profile"><i class="fa fa-user"></i> Profile</a>',
    expectedText: '[HA1][HV1] Profile[/HA1]',
    expectedReplacements: 2,
  },
  {
    name: '6. Multiple FA icons',
    input: '<i class="far fa-edit"></i> Edit <i class="fas fa-trash"></i> Delete',
    expectedText: '[HV1] Edit [HV2] Delete',
    expectedReplacements: 2,
  },
  {
    name: '7. v6 FA classes',
    input: 'Icon <i class="fa-solid fa-check"></i> here.',
    expectedText: 'Icon [HV1] here.',
    expectedReplacements: 1,
  },

  // === Whitespace-only tags → void with whitespace extracted ===
  {
    name: '8. Single space inside tag → void + space after',
    input: 'Before<i class="fa fa-icon"> </i>after.',
    expectedText: 'Before[HV1] after.',
    expectedReplacements: 1,
    expectedRestored: 'Before<i class="fa fa-icon"></i> after.', // Space moved outside
  },
  {
    name: '9. Multiple spaces inside tag (normalized to 1)',
    input: 'Before<i class="fa">   </i>after.',
    expectedText: 'Before[HV1] after.',
    expectedReplacements: 1,
    expectedRestored: 'Before<i class="fa"></i> after.',
  },
  {
    name: '10. Tab inside tag',
    input: 'Before<span class="x">\t</span>after.',
    expectedText: 'Before[HV1] after.', // Tab normalized to space
    expectedReplacements: 1,
    expectedRestored: 'Before<span class="x"></span> after.',
  },
  {
    name: '11. Newline inside tag (normalized to space)',
    input: 'Before<span class="x">\n</span>after.',
    expectedText: 'Before[HV1] after.',
    expectedReplacements: 1,
    expectedRestored: 'Before<span class="x"></span> after.',
  },
  {
    name: '12. Nested whitespace-only icon in link',
    input: '<a href="/user"><i class="fa fa-user"> </i>Profile</a>',
    expectedText: '[HA1][HV1] Profile[/HA1]',
    expectedReplacements: 2,
    expectedRestored: '<a href="/user"><i class="fa fa-user"></i> Profile</a>',
  },
  {
    name: '13. Mixed empty and whitespace-only',
    input: '<i class="fa-edit"></i> Edit <i class="fa-save"> </i>Save',
    expectedText: '[HV1] Edit [HV2] Save',
    expectedReplacements: 2,
    expectedRestored: '<i class="fa-edit"></i> Edit <i class="fa-save"></i> Save',
  },
  {
    name: '14. Real content still works (not affected)',
    input: 'Click <i class="emphasis">here</i> now.',
    expectedText: 'Click [HE1]here[/HE1] now.',
    expectedReplacements: 1,
  },
]

function runTests() {
  console.log('=== Empty Paired Tags → Void Element Tests ===\n')

  let passed = 0
  let failed = 0

  for (const tc of testCases) {
    const { text, replacements } = htmlToPlaceholders(tc.input)

    const textMatch = text === tc.expectedText
    const countMatch = replacements.length === tc.expectedReplacements

    if (textMatch && countMatch) {
      console.log(`PASS: ${tc.name}`)
      passed++
    } else {
      console.log(`FAIL: ${tc.name}`)
      if (!textMatch) {
        console.log(`  Expected text: ${tc.expectedText}`)
        console.log(`  Got text:      ${text}`)
      }
      if (!countMatch) {
        console.log(`  Expected ${tc.expectedReplacements} replacements, got ${replacements.length}`)
      }
      failed++
    }

    // Test round-trip restoration
    const restored = placeholdersToHtml(text, replacements)
    // Use expectedRestored if provided (for cases where whitespace moves outside tag)
    const expectedRestoredText = tc.expectedRestored ?? tc.input
    // Normalize whitespace for comparison
    const normalizedExpected = expectedRestoredText.replace(/\s+/g, ' ').trim()
    const normalizedRestored = restored.replace(/\s+/g, ' ').trim()
    if (normalizedExpected !== normalizedRestored) {
      console.log(`  WARN: Round-trip mismatch`)
      console.log(`  Expected:  ${normalizedExpected}`)
      console.log(`  Restored:  ${normalizedRestored}`)
    }
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`)
  process.exit(failed > 0 ? 1 : 0)
}

runTests()
