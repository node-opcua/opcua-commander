const fs = require('fs');
const path = require('path');

const widgetPath = path.join(process.cwd(), 'node_modules', 'blessed', 'lib', 'widget.js');
if (!fs.existsSync(widgetPath)) {
  console.error('Could not find blessed/lib/widget.js');
  process.exit(1);
}

let source = fs.readFileSync(widgetPath, 'utf8');

const classes = [
  'Node', 'Screen', 'Element', 'Box', 'Text', 'Line', 'ScrollableBox',
  'ScrollableText', 'BigText', 'List', 'Form', 'Input', 'Textarea',
  'Textbox', 'Button', 'ProgressBar', 'FileManager', 'Checkbox',
  'RadioSet', 'RadioButton', 'Prompt', 'Question', 'Message',
  'Loading', 'Listbar', 'Log', 'Table', 'ListTable', 'Terminal',
  'Image', 'ANSIImage', 'OverlayImage', 'Video', 'Layout'
];

const replacements = classes.map(name => {
  const file = name.toLowerCase();
  return `widget['${name}'] = widget['${file}'] = require('./widgets/${file}');`;
}).join('\n');

const newSource = source.replace(/widget\.classes\.forEach\(function\(name\) \{[\s\S]+?\}\);/, replacements);

if (source !== newSource) {
  fs.writeFileSync(widgetPath, newSource);
  console.log('Successfully patched blessed/lib/widget.js');
} else {
  console.log('blessed/lib/widget.js already patched or regex failed');
}

// Patch tput.js
const tputPath = path.join(process.cwd(), 'node_modules', 'blessed', 'lib', 'tput.js');
if (fs.existsSync(tputPath)) {
  let tputSource = fs.readFileSync(tputPath, 'utf8');
  const newTputSource = tputSource.replace(/__dirname \+ '\/\.\.\/usr/g, "__dirname + '/usr");
  if (tputSource !== newTputSource) {
    fs.writeFileSync(tputPath, newTputSource);
    console.log('Successfully patched blessed/lib/tput.js');
  }
}

// Patch bigtext.js
const bigtextPath = path.join(process.cwd(), 'node_modules', 'blessed', 'lib', 'widgets', 'bigtext.js');
if (fs.existsSync(bigtextPath)) {
  let bigtextSource = fs.readFileSync(bigtextPath, 'utf8');
  const newBigtextSource = bigtextSource.replace(/__dirname \+ '\/\.\.\/\.\.\/usr/g, "__dirname + '/usr");
  if (bigtextSource !== newBigtextSource) {
    fs.writeFileSync(bigtextPath, newBigtextSource);
    console.log('Successfully patched blessed/lib/widgets/bigtext.js');
  }
}
