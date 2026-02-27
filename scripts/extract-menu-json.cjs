const fs = require('fs');
const har = JSON.parse(fs.readFileSync('C:/Users/Irfan/Downloads/developer.grab.com.har', 'utf8'));
const entry = har.log.entries[0];
const body = JSON.parse(entry.request.postData.text);
const menu = JSON.parse(body.menu);
fs.writeFileSync('docs/grabfood-menu-simulator-sample.json', JSON.stringify(menu, null, 2));
console.log('Menu structure saved');
console.log('Top-level keys:', Object.keys(menu));
console.log('Sections:', menu.sections.length);
menu.sections.forEach(s => {
  console.log('  Section:', s.id, s.name, '- Categories:', s.categories.length);
  s.categories.forEach(c => {
    console.log('    Category:', c.id, c.name, '- Items:', c.items.length);
    c.items.forEach(item => {
      console.log('      Item:', item.id, item.name, '- Price:', item.price, '- Modifiers:', (item.modifierGroups || []).length);
    });
  });
});
