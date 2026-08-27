import test from 'node:test';
import assert from 'node:assert/strict';
import { countWords } from './word-count.js';

test('counts words in page.text when BookStack populates it', () => {
  assert.equal(countWords({ text: 'one two three' }), 3);
});

test('splits on any whitespace, not just a single space', () => {
  assert.equal(countWords({ text: 'one\ntwo\tthree  four\r\nfive' }), 5);
});

test('ignores leading, trailing and repeated whitespace', () => {
  assert.equal(countWords({ text: '  one   two  ' }), 2);
});

test('falls back to markdown when text is empty (WYSIWYG pages)', () => {
  assert.equal(countWords({ text: '', markdown: '# Title\n\nBody text here' }), 5);
});

test('falls back to html when neither text nor markdown is present', () => {
  assert.equal(countWords({ html: '<p>Hello <strong>there</strong> world</p>' }), 3);
});

test('does not count markup or script/style bodies as words', () => {
  const html = '<style>.a{color:red}</style><script>var x = 1;</script><p>only these three</p>';
  assert.equal(countWords({ html }), 3);
});

test('treats &nbsp; as a separator', () => {
  assert.equal(countWords({ html: '<p>one&nbsp;two</p>' }), 2);
});

test('returns 0 for a page with no content at all', () => {
  assert.equal(countWords({}), 0);
  assert.equal(countWords({ text: '', markdown: '', html: '' }), 0);
  assert.equal(countWords({ text: null, markdown: null, html: null }), 0);
});
