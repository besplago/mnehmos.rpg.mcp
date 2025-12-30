export const ITEM_PRESETS: Record<string, any> = {
    // Weapons
    'longsword': {
        name: 'Longsword',
        type: 'weapon',
        description: 'A versatile blade favored by knights and warriors.',
        rarity: 'common',
        weight: 3,
        cost: 15,
        weaponType: 'martial',
        damage: '1d8',
        damageType: 'slashing',
        properties: ['versatile (1d10)']
    },
    'shortsword': {
        name: 'Shortsword',
        type: 'weapon',
        description: 'A light, quick blade.',
        rarity: 'common',
        weight: 2,
        cost: 10,
        weaponType: 'martial',
        damage: '1d6',
        damageType: 'piercing',
        properties: ['finesse', 'light']
    },
    'dagger': {
        name: 'Dagger',
        type: 'weapon',
        description: 'A small knife, easily concealed.',
        rarity: 'common',
        weight: 1,
        cost: 2,
        weaponType: 'simple',
        damage: '1d4',
        damageType: 'piercing',
        properties: ['finesse', 'light', 'thrown (20/60)']
    },
    'greataxe': {
        name: 'Greataxe',
        type: 'weapon',
        description: 'A massive axe capable of cleaving foes in two.',
        rarity: 'common',
        weight: 7,
        cost: 30,
        weaponType: 'martial',
        damage: '1d12',
        damageType: 'slashing',
        properties: ['heavy', 'two-handed']
    },
    'shortbow': {
        name: 'Shortbow',
        type: 'weapon',
        description: 'A small bow used for hunting and skirmishing.',
        rarity: 'common',
        weight: 2,
        cost: 25,
        weaponType: 'simple',
        damage: '1d6',
        damageType: 'piercing',
        properties: ['ammunition', 'range (80/320)', 'two-handed']
    },
    'longbow': {
        name: 'Longbow',
        type: 'weapon',
        description: 'A powerful bow used by trained archers.',
        rarity: 'common',
        weight: 2,
        cost: 50,
        weaponType: 'martial',
        damage: '1d8',
        damageType: 'piercing',
        properties: ['ammunition', 'heavy', 'range (150/600)', 'two-handed']
    },
    
    // Armor
    'leather_armor': {
        name: 'Leather Armor',
        type: 'armor',
        description: 'The breastplate and shoulder protectors of this armor are made of leather that has been stiffened by being boiled in oil.',
        rarity: 'common',
        weight: 10,
        cost: 10,
        armorType: 'light',
        ac: 11,
        dexBonus: true // Full dex
    },
    'chain_shirt': {
        name: 'Chain Shirt',
        type: 'armor',
        description: 'Made of interlocking metal rings, a chain shirt is worn between layers of clothing or leather.',
        rarity: 'common',
        weight: 20,
        cost: 50,
        armorType: 'medium',
        ac: 13,
        dexBonus: true,
        maxDexBonus: 2
    },
    'chain_mail': {
        name: 'Chain Mail',
        type: 'armor',
        description: 'Made of interlocking metal rings, chain mail includes a layer of quilted fabric worn underneath the mail to prevent chafing and to cushion the impact of blows.',
        rarity: 'common',
        weight: 55,
        cost: 75,
        armorType: 'heavy',
        ac: 16,
        dexBonus: false,
        strengthRequirement: 13,
        stealthDisadvantage: true
    },
    'plate_armor': {
        name: 'Plate Armor',
        type: 'armor',
        description: 'Plate consists of shaped, interlocking metal plates to cover the entire body.',
        rarity: 'common',
        weight: 65,
        cost: 1500,
        armorType: 'heavy',
        ac: 18,
        dexBonus: false,
        strengthRequirement: 15,
        stealthDisadvantage: true
    },
    'shield': {
        name: 'Shield',
        type: 'armor',
        description: 'A shield is made from wood or metal and is carried in one hand.',
        rarity: 'common',
        weight: 6,
        cost: 10,
        armorType: 'shield',
        ac: 2
    },

    // Potions
    'potion_healing': {
        name: 'Potion of Healing',
        type: 'consumable',
        description: 'A character who drinks the magical red fluid in this vial regains 2d4 + 2 hit points.',
        rarity: 'common',
        weight: 0.5,
        cost: 50,
        effect: 'heal',
        amount: '2d4+2'
    },
    
    // Adventuring Gear
    'backpack': {
        name: 'Backpack',
        type: 'gear',
        description: 'A backpack capable of holding 1 cubic foot/30 pounds of gear.',
        weight: 5,
        cost: 2
    },
    'torch': {
        name: 'Torch',
        type: 'gear',
        description: 'A torch burns for 1 hour, providing bright light in a 20-foot radius and dim light for an additional 20 feet.',
        weight: 1,
        cost: 0.01
    }
};

export const getPreset = (id: string) => ITEM_PRESETS[id.toLowerCase()] || null;
