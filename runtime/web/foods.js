/* Shared by the classic browser script and the server through a side-effect import. */
(() => {
  const groups = { fruit: ['Fruit', 'Frutas'], vegetables: ['Vegetables', 'Verduras'], grains: ['Grains', 'Cereales'], protein: ['Protein foods', 'Proteínas'], dairy: ['Dairy', 'Lácteos'] };
  const catalog = [
    ['avocado', 'Avocado', 'Aguacate', 'fruit'],
    ['banana', 'Banana', 'Plátano', 'fruit'],
    ['apple', 'Apple', 'Manzana', 'fruit'],
    ['pear', 'Pear', 'Pera', 'fruit'],
    ['mango', 'Mango', 'Mango', 'fruit'],
    ['carrot', 'Carrot', 'Zanahoria', 'vegetables'],
    ['sweet-potato', 'Sweet potato', 'Camote', 'vegetables'],
    ['broccoli', 'Broccoli', 'Brócoli', 'vegetables'],
    ['zucchini', 'Zucchini', 'Calabacita', 'vegetables'],
    ['oats', 'Oats', 'Avena', 'grains'],
    ['rice', 'Rice', 'Arroz', 'grains'],
    ['egg', 'Egg', 'Huevo', 'protein'],
    ['chicken', 'Chicken', 'Pollo', 'protein'],
    ['lentils', 'Lentils', 'Lentejas', 'protein'],
    ['yogurt', 'Yogurt', 'Yogur', 'dairy'],
  ].map(([id, en, es, group]) => ({ id, name: [en, es], group: groups[group], image: `/foods/${id}.svg` }));
  const key = name => typeof name === 'string' ? name.trim().toLocaleLowerCase() : '';
  function resolve(name) {
    const matches = catalog.filter(food => food.name.some(label => key(label) === key(name)));
    return matches.length === 1 ? matches[0].id : null;
  }
  function summary(entries) {
    const items = catalog.map(food => ({ ...food, tried: false, preference: null, status: 'not-tried' }));
    const custom = new Map(), latest = new Map();
    for (const entry of entries) {
      if (entry.type !== 'other' || entry.what !== 'solids') continue;
      const id = catalog.some(food => food.id === entry.foodId) ? entry.foodId : resolve(entry.food);
      let item = id ? items.find(food => food.id === id) : custom.get(key(entry.food));
      if (!item) {
        const name = typeof entry.food === 'string' ? entry.food.trim() : '';
        if (!name) continue;
        item = { id: null, name: [name, name], group: ['Custom foods', 'Otros alimentos'], image: null, tried: false, preference: null, status: 'not-tried' };
        custom.set(key(name), item);
      }
      item.tried = true;
      const time = entry.startISO ? Date.parse(entry.startISO) : Number(entry.t);
      if (['liked', 'disliked'].includes(entry.preference) && (!latest.has(item) || time >= latest.get(item))) {
        item.preference = entry.preference;
        latest.set(item, time);
      }
      item.status = item.preference || 'tried';
    }
    return [...items, ...custom.values()];
  }
  globalThis.LITTLE_DAYS_FOODS = { catalog, resolve, summary };
})();
