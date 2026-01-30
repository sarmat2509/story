-- Add prompt_guidance column to scenario_cards
ALTER TABLE scenario_cards ADD COLUMN prompt_guidance TEXT;

-- Update existing scenarios with detailed 30-50 word guidance + book examples
UPDATE scenario_cards SET prompt_guidance = 
  'Stories of brave knights, medieval tournaments, rescuing characters from castle dungeons, noble quests, sword fights, castles and kingdoms. Think Robin Hood adventures, knight''s honor, and medieval courage. Style examples: Robin Hood tales, King Arthur legends, Ivanhoe for children.' 
WHERE id = 'medieval_heroes';

UPDATE scenario_cards SET prompt_guidance = 
  'Magical adventures with wizards, spell-casting, magic schools, enchanted objects, learning to control magical powers. Include wands, potions, magical creatures, and young wizards discovering their abilities. Style examples: Harry Potter (age-appropriate), The Worst Witch, A Wizard of Earthsea.'
WHERE id = 'magic_wizards';

UPDATE scenario_cards SET prompt_guidance = 
  'Encounters with dragons, unicorns, phoenixes, griffins, and other mythical creatures. Stories about befriending magical beings, understanding their nature, protecting them, or going on quests together. Style examples: How to Train Your Dragon, The Last Unicorn, Dragon Rider.'
WHERE id = 'fantasy_creatures';

UPDATE scenario_cards SET prompt_guidance = 
  'Detective work, solving mysteries, finding clues, piecing together puzzles. Include investigation scenes, hidden secrets, mysterious disappearances, and clever deduction. Age-appropriate mysteries with satisfying solutions. Style examples: Encyclopedia Brown, Nancy Drew (younger versions), The 39 Clues.'
WHERE id = 'mysteries_detectives';

UPDATE scenario_cards SET prompt_guidance = 
  'Space exploration, visiting distant planets, meeting alien friends, space stations, rocket ships, zero gravity adventures. Include wonder of space discovery, futuristic technology, and cosmic exploration. Style examples: The Little Prince (space parts), Commander Toad series, Zita the Spacegirl.'
WHERE id = 'space_odyssey';

UPDATE scenario_cards SET prompt_guidance = 
  'Pirate ships, treasure maps, island adventures, sailing the seas, finding hidden treasures. Include treasure hunts, nautical adventures, friendly pirate crews, and ocean exploration. Focus on adventure and discovery. Style examples: Treasure Island (adapted), Pirates Don''t Change Diapers, Peter Pan pirate scenes.'
WHERE id = 'sea_treasures';

UPDATE scenario_cards SET prompt_guidance = 
  'Characters discovering superpowers, learning to use them responsibly, helping others, facing challenges that need special abilities. Include flying, super strength, invisibility, or unique powers. Emphasize responsibility and kindness. Style examples: The Incredibles, Sky High, Captain Underpants (heroic parts).'
WHERE id = 'super_powers';

UPDATE scenario_cards SET prompt_guidance = 
  'Magical forests with talking animals, fairy folk, enchanted trees, hidden glades, nature magic. Include forest adventures, meeting woodland creatures, discovering magical plants, and protecting the forest. Style examples: Winnie the Pooh (enchanted aspects), The Chronicles of Narnia (forest scenes), Fairy Oak.'
WHERE id = 'enchanted_forest';

UPDATE scenario_cards SET prompt_guidance = 
  'Creating inventions, experimenting with science, building gadgets, solving problems through innovation. Include workshops, laboratories, creative problem-solving, testing inventions. Style examples: The Wild Robot, Rosie Revere Engineer, Chitty Chitty Bang Bang.'
WHERE id = 'inventors';

UPDATE scenario_cards SET prompt_guidance = 
  'Jungle exploration, tropical adventures, discovering exotic animals, ancient ruins, rope bridges, hidden temples. Include wildlife encounters, jungle navigation, archaeological discoveries. Focus on exploration and natural wonders. Style examples: The Jungle Book, Journey to the River Sea, Dinosaur Cove series.'
WHERE id = 'jungle_adventures';

-- Make column NOT NULL after populating data
ALTER TABLE scenario_cards ALTER COLUMN prompt_guidance SET NOT NULL;
