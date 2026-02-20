-- Migration: Add scenario_plot_examples table for diverse story settings
-- Created: 2026-02-15

CREATE TABLE IF NOT EXISTS scenario_plot_examples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_card_id VARCHAR(100) NOT NULL REFERENCES scenario_cards(id) ON DELETE CASCADE,
  setting TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scenario_plot_examples_card ON scenario_plot_examples(scenario_card_id);

-- ==========================================
-- SEED DATA: 20 examples per scenario card
-- ==========================================

-- magic_wizards (20)
INSERT INTO scenario_plot_examples (scenario_card_id, setting, sort_order) VALUES
('magic_wizards', 'A wizard school hidden inside a giant tree where students learn spells by singing to enchanted crystals. One crystal starts glowing a color nobody has ever seen before.', 1),
('magic_wizards', 'A traveling potion shop on wheels arrives in a small village. The shopkeeper offers one free potion but warns that it will only work if used for someone else.', 2),
('magic_wizards', 'A young apprentice accidentally turns their teacher into a talking cat. To reverse the spell, they must find three ingredients hidden in a magical market that appears only at sunset.', 3),
('magic_wizards', 'An old library where books fly off shelves and act out their stories. One book is blank and refuses to leave the protagonist alone until its story is written.', 4),
('magic_wizards', 'A village where every child receives a magic wand on their seventh birthday. This year, one wand chooses a child who nobody expected — and it does something completely new.', 5),
('magic_wizards', 'A magic mirror in the attic shows not reflections but glimpses of tomorrow. One morning it shows something that hasn''t happened yet — and the protagonist must decide whether to change it.', 6),
('magic_wizards', 'A bakery where pastries grant temporary magical abilities. Someone switches the labels, and the whole town wakes up with the wrong powers.', 7),
('magic_wizards', 'A wizard tournament where contestants solve enchanted puzzles instead of dueling. The final puzzle requires cooperation between rivals to unlock the prize.', 8),
('magic_wizards', 'A musical instrument that plays itself at midnight. Each melody unlocks a door to a different magical realm — but one realm has been calling for help.', 9),
('magic_wizards', 'A grandmother''s old recipe book contains real spells disguised as cooking instructions. Following the recipe for "Starlight Soup" opens a portal in the kitchen.', 10),
('magic_wizards', 'An enchanted garden where plants grow based on the gardener''s emotions. When the protagonist feels nervous about a big event, the garden starts growing something extraordinary.', 11),
('magic_wizards', 'A train station platform that only appears during thunderstorms, leading to a school for weather wizards hidden above the clouds.', 12),
('magic_wizards', 'A magical pen that brings drawings to life. The protagonist draws a friend, but the drawing has its own ideas about what adventure to go on.', 13),
('magic_wizards', 'A clock tower in the center of town has stopped. Legend says a sleeping wizard inside will wake when someone solves the riddle carved on the clock face.', 14),
('magic_wizards', 'A set of enchanted chess pieces that give real-world advice. When a new piece mysteriously appears on the board, it delivers a warning about something happening in the town.', 15),
('magic_wizards', 'A snow globe collection where each globe contains a tiny living world. One night, a figure inside a globe waves and holds up a sign asking for help.', 16),
('magic_wizards', 'A magic carpet repair shop where each carpet has a personality and a favorite destination. One stubborn carpet refuses to fly anywhere except one mysterious location.', 17),
('magic_wizards', 'An enchanted compass that doesn''t point north — it points toward whatever the holder needs most. Today it points toward the old abandoned well at the edge of town.', 18),
('magic_wizards', 'A street performer''s hat that produces real animals instead of rabbits. When a tiny phoenix hatches from the hat, it leads the protagonist on an unexpected quest.', 19),
('magic_wizards', 'A pair of magical shoes found at a flea market. They only work at night and take the wearer to places where someone needs a kind deed done.', 20);

-- fantasy_creatures (20)
INSERT INTO scenario_plot_examples (scenario_card_id, setting, sort_order) VALUES
('fantasy_creatures', 'A young dragon who is afraid of heights lives in a valley while all other dragons soar above. A lost traveler arrives and needs to reach the mountain peak by sunrise.', 1),
('fantasy_creatures', 'A phoenix egg is found in a cold fireplace in an old house. The egg needs warmth and stories to hatch, and the creature inside remembers everything it hears.', 2),
('fantasy_creatures', 'A unicorn with a broken horn wanders into a village garden at night. It can no longer make flowers bloom and seeks a child willing to help restore its magic.', 3),
('fantasy_creatures', 'A family of griffins nests on the roof of the town hall every spring. This year, the smallest griffin refuses to fly south and befriends a local child instead.', 4),
('fantasy_creatures', 'A mermaid''s song echoes from a well in the town square. She is trapped between worlds and needs someone to bring three seashells from three different shores.', 5),
('fantasy_creatures', 'A shape-shifting fox lives in the park and changes form to match whoever it''s talking to. It has a problem only its true form can solve — but it has forgotten what that looks like.', 6),
('fantasy_creatures', 'A giant friendly tortoise carries a miniature forest on its shell. The tiny creatures living there send a message asking for a diplomat to negotiate with the garden snails.', 7),
('fantasy_creatures', 'An ice sprite appears only when it snows and builds elaborate frost sculptures with hidden messages. This winter''s message is a map leading somewhere unexpected.', 8),
('fantasy_creatures', 'A baby kraken in a tide pool is too small for the ocean and too big for the pool. Nearby fishermen are frightened, but a child sees it just needs help getting home.', 9),
('fantasy_creatures', 'A pegasus foal lands in a meadow with an injured wing during a storm. Caring for it reveals that the foal was carrying something important to a distant kingdom.', 10),
('fantasy_creatures', 'A colony of tiny fairies lives inside the walls of an old bookshop. They protect the stories but one book is making them sick — and it must be found and healed.', 11),
('fantasy_creatures', 'A friendly troll lives under the town bridge and collects lost things that fall into the river. One day it finds something that clearly belongs to someone in trouble.', 12),
('fantasy_creatures', 'A sleeping giant in the hills is mistaken for a mountain. Flowers growing on its back are the only cure for a village illness, but picking them might wake the giant.', 13),
('fantasy_creatures', 'A chameleon-like creature appears in the schoolyard, perfectly blending in. It communicates through color patterns and seems to be warning about something approaching.', 14),
('fantasy_creatures', 'A cloud whale swims through the sky above a coastal village. Children can see it but adults cannot. The whale drops a single shimmering scale into a child''s hands.', 15),
('fantasy_creatures', 'An ancient tree in the forest has a face and speaks only during the autumn equinox. This year it asks for a favor it has never requested before.', 16),
('fantasy_creatures', 'A newborn thunderbird accidentally causes tiny lightning storms wherever it goes. The protagonist must help guide it back to Storm Mountain before the weather gets worse.', 17),
('fantasy_creatures', 'A river serpent who guards a bridge only allows passage to those who tell it a story it hasn''t heard. The protagonist must cross but has run out of tales.', 18),
('fantasy_creatures', 'A colony of glow-worms in a cave creates moving pictures on the walls. A child stumbles in and realizes the pictures are telling the story of something that is about to happen.', 19),
('fantasy_creatures', 'A sand fox in the desert collects dreams that blow away in the wind. It offers to return a lost dream to the protagonist — but it needs help reading the dream map.', 20);

-- mysteries_detectives (20)
INSERT INTO scenario_plot_examples (scenario_card_id, setting, sort_order) VALUES
('mysteries_detectives', 'A town clock starts chiming at wrong hours. Each wrong chime corresponds to a location where a small golden key has been hidden. Collecting all keys opens a forgotten room in the town hall.', 1),
('mysteries_detectives', 'Books in the school library keep moving to different shelves overnight. A pattern in the rearranged titles spells out a message that leads to a decades-old time capsule.', 2),
('mysteries_detectives', 'A neighbor''s garden gnomes appear in different positions each morning. Mapping their movements reveals they point toward something buried under the old oak tree.', 3),
('mysteries_detectives', 'Footprints appear on a snowy rooftop with no ladder or staircase nearby. Following the trail backward leads to a surprising secret about the building''s history.', 4),
('mysteries_detectives', 'A painting in the museum changes slightly every week — a new object appears in the background. The objects form a code that reveals the painter''s hidden message.', 5),
('mysteries_detectives', 'Letters addressed to a person who doesn''t exist keep arriving at the post office. The return address is a building that was demolished twenty years ago.', 6),
('mysteries_detectives', 'A street musician plays the same melody every day at noon. One day the melody changes, and a local shopkeeper reacts with surprise — they recognize the tune from childhood.', 7),
('mysteries_detectives', 'A coin found in a playground has markings from no known country. A coin collector reveals it matches a set of coins from a famous unsolved local legend.', 8),
('mysteries_detectives', 'Animals in the neighborhood start behaving strangely — cats gathering at one spot, birds flying in unusual patterns. Following their lead reveals a hidden underground spring.', 9),
('mysteries_detectives', 'A message in a bottle washes up on the shore of a city river. The message contains coordinates that point to the city''s oldest building and a puzzle on its walls.', 10),
('mysteries_detectives', 'A bakery''s prize-winning recipe has gone missing and the competition is tomorrow. Flour footprints, a torn apron piece, and a list of ingredients provide the first clues.', 11),
('mysteries_detectives', 'An old photograph found in a thrift store jacket shows the protagonist''s school — but the photo is from 1920 and a child in it is holding a familiar-looking toy.', 12),
('mysteries_detectives', 'The school bus takes a wrong turn one foggy morning and passes a street that doesn''t appear on any map. A student photographs a shop sign before the bus corrects course.', 13),
('mysteries_detectives', 'A bird delivers the same acorn to the protagonist''s windowsill every morning. Inside each acorn is a tiny rolled-up paper with a single word. The words form a sentence over time.', 14),
('mysteries_detectives', 'Chalk drawings appear on the sidewalk overnight depicting real locations around town, each with a small X mark. Visiting each X reveals a piece of a larger puzzle.', 15),
('mysteries_detectives', 'A radio in a junk shop turns on by itself and plays recordings of conversations from long ago. One conversation mentions a hidden compartment in the shop''s original counter.', 16),
('mysteries_detectives', 'A lighthouse keeper''s logbook washes up on shore. The last entries describe a pattern of lights seen at sea that spell out coordinates to an island not on any chart.', 17),
('mysteries_detectives', 'Three neighbors all report hearing music at 3 AM coming from different directions. Plotting the three directions on a map reveals they intersect at the old train depot.', 18),
('mysteries_detectives', 'A friend''s locket contains a photo of a door that matches no building anyone has seen. Researching old architecture records reveals the door once existed — in a house now underwater.', 19),
('mysteries_detectives', 'Every bench in the park has initials carved underneath. A retired teacher mentions they are clues to a scavenger hunt from 1965 that nobody ever finished.', 20);

-- space_odyssey (20)
INSERT INTO scenario_plot_examples (scenario_card_id, setting, sort_order) VALUES
('space_odyssey', 'A small space station orbiting a ringed planet receives a transmission in a language that doesn''t match any known species. The message is a lullaby.', 1),
('space_odyssey', 'A family of space farmers on a distant moon discovers a seed that grows a plant overnight, pointing toward a hidden cave beneath the surface.', 2),
('space_odyssey', 'A space mail carrier must deliver a package to the farthest outpost in the galaxy. The package starts making sounds during the journey and won''t stop until it''s opened.', 3),
('space_odyssey', 'A child stowaway on a cargo shuttle is discovered after takeoff. The crew is headed to a planet made entirely of crystal, where sounds create visible colors.', 4),
('space_odyssey', 'A comet passes close to a space colony every hundred years. This time, the comet leaves behind a trail of glowing dust that reveals a hidden star map in the sky.', 5),
('space_odyssey', 'A robot companion starts drawing pictures of a planet it has never visited. The drawings match a planet recently discovered by deep-space probes.', 6),
('space_odyssey', 'A floating city above a gas giant has a festival where children launch light-kites into the clouds. One kite comes back carrying a message from below the clouds.', 7),
('space_odyssey', 'An asteroid mining crew finds a perfectly smooth sphere embedded in rock. The sphere hums at certain frequencies and projects star charts on the walls.', 8),
('space_odyssey', 'A young astronaut''s first mission is to catalog plant life on a newly discovered moon. The plants react to music and arrange themselves in geometric patterns.', 9),
('space_odyssey', 'A space lighthouse keeper notices one ship always passes at the same time but never appears on the registry. Following its trajectory reveals a hidden jump point.', 10),
('space_odyssey', 'A child builds a radio telescope from junk parts and picks up a signal that turns out to be a greeting from a friendly civilization on a nearby star system.', 11),
('space_odyssey', 'A zero-gravity sports tournament between space stations is interrupted when the arena dome reveals an ancient inscription that was invisible until the lights aligned.', 12),
('space_odyssey', 'A rescue shuttle discovers a derelict greenhouse ship drifting through space. Inside, the plants are thriving and have grown into the shape of a welcome message.', 13),
('space_odyssey', 'A planet where it rains colored dust. Collecting different colors and combining them reveals a chemical compound that can repair the colony''s broken water recycler.', 14),
('space_odyssey', 'A space whale swims near a space station and refuses to leave. The station''s biologist realizes it is trying to communicate through vibrations in the hull.', 15),
('space_odyssey', 'An old telescope at a retiring astronomer''s home shows something that modern telescopes cannot see — a faint blinking light that matches an ancient star signal code.', 16),
('space_odyssey', 'A meteor shower deposits tiny metallic insects on the hull of a ship. They are harmless, organized, and start building a miniature structure that looks like a bridge.', 17),
('space_odyssey', 'A planet''s rings are made of frozen music — literally frozen sound waves. A visiting child''s laughter thaws a segment and releases a beautiful melody across the system.', 18),
('space_odyssey', 'A mapping expedition to chart a nebula discovers the nebula has a heartbeat. The rhythmic pulses correspond to a pattern that matches a nursery rhyme from Earth.', 19),
('space_odyssey', 'A gravity anomaly near a moon causes objects to float upward once a day. During one such event, an ancient artifact rises from beneath the sand, glowing softly.', 20);

-- medieval_heroes (20)
INSERT INTO scenario_plot_examples (scenario_card_id, setting, sort_order) VALUES
('medieval_heroes', 'A squire discovers that the castle''s suits of armor whisper advice at night. One suit insists the squire must find a lost shield hidden somewhere in the village before the tournament.', 1),
('medieval_heroes', 'A traveling troupe of puppeteers arrives at the kingdom and performs a play that matches real events happening in the castle — events nobody outside should know about.', 2),
('medieval_heroes', 'A young page is tasked with delivering a sealed message to a neighboring kingdom. Along the way, the message seal begins to glow, revealing a hidden second message underneath.', 3),
('medieval_heroes', 'A blacksmith''s apprentice accidentally forges a sword that sings when danger is near. The sword starts humming during the peaceful harvest festival.', 4),
('medieval_heroes', 'A princess disguises herself as a stable hand to enter a horse race. During the race, she discovers a hidden path through the forest that leads to a forgotten watchtower.', 5),
('medieval_heroes', 'The castle moat mysteriously drains overnight. At the bottom, villagers find stepping stones with symbols that form a map to the kingdom''s original founding charter.', 6),
('medieval_heroes', 'A young herald must announce a grand feast but discovers the invitation scroll has been magically altered. The changes reveal someone is planning a surprise — but who and why?', 7),
('medieval_heroes', 'A jousting field sprouts unusual flowers overnight where a knight fell during practice. The flowers only bloom in moonlight and lead a trail to the old chapel.', 8),
('medieval_heroes', 'A baker who supplies the castle finds a golden coin in the flour delivery. The coin bears the face of a king from a kingdom that supposedly never existed.', 9),
('medieval_heroes', 'A falcon trained by the royal falconer keeps flying to the same tower every day and returning with a small object — feathers, stones, twigs — that together form a picture.', 10),
('medieval_heroes', 'A tapestry in the great hall begins to change: new threads appear each night weaving a scene that no one embroidered. The scene depicts an event that hasn''t happened yet.', 11),
('medieval_heroes', 'A drought threatens the kingdom. An old monk reveals that beneath the castle lies an ancient well, but reaching it requires solving riddles carved into the cellar walls.', 12),
('medieval_heroes', 'Two rival villages must work together when a bridge collapses during a storm. Building a new bridge reveals ancient foundations with an inscription about unity.', 13),
('medieval_heroes', 'A knight returns from a quest with a shield that bears a crest nobody recognizes. The local historian says the crest belongs to a legendary order thought to be fictional.', 14),
('medieval_heroes', 'A wandering minstrel plays songs that make people remember things they had forgotten. One song makes the king remember a promise he made as a child.', 15),
('medieval_heroes', 'A young archer wins the village competition but the prize is a map, not gold. The map shows a path through the Whispering Woods to a grove where wishes are granted once a century.', 16),
('medieval_heroes', 'A group of children exploring castle tunnels finds a room full of lanterns, each labeled with a family name from the village. One lantern is dark and needs relighting.', 17),
('medieval_heroes', 'The kingdom''s flag is stolen before a peace ceremony. Following clues through the market, the training grounds, and the harbor reveals it was taken for a heartwarming reason.', 18),
('medieval_heroes', 'A stone gargoyle on the cathedral is found facing a different direction each morning. Plotting its gaze on a map leads to a hidden garden behind the old mill.', 19),
('medieval_heroes', 'A child helping at the royal stables discovers one horse can understand human speech. The horse knows a secret about a hidden passage under the castle wall.', 20);

-- sea_treasures (20)
INSERT INTO scenario_plot_examples (scenario_card_id, setting, sort_order) VALUES
('sea_treasures', 'A tide pool at the edge of a fishing village glows blue at night. Diving into it reveals an underwater cave with walls covered in old sailors'' maps.', 1),
('sea_treasures', 'A message in a bottle washes up on shore, written by a child from a century ago. It describes a treasure game with clues hidden around the harbor — and the clues are still there.', 2),
('sea_treasures', 'A retired sea captain''s parrot repeats coordinates every evening at sunset. Following the coordinates leads to a small island where the captain buried something unexpected.', 3),
('sea_treasures', 'A sunken rowboat visible at low tide has a compass sealed in a waterproof box. The compass doesn''t point north — it points to different locations each day of the week.', 4),
('sea_treasures', 'A coral reef shaped like a crown is discovered by snorkelers. Local legends say whoever finds the matching scepter hidden on land will unite two feuding harbor families.', 5),
('sea_treasures', 'A fishing net hauls up an old locked chest that plays a music box tune when shaken. The tune matches a shanty that contains directions embedded in the lyrics.', 6),
('sea_treasures', 'A new island appears after a storm, made entirely of compacted sand and shells. Exploring it reveals it was shaped intentionally — a giant sand sculpture with a chamber inside.', 7),
('sea_treasures', 'A lighthouse keeper finds that the lighthouse beam reveals hidden markings on coastal rocks when it sweeps past at exactly midnight. The markings form a nautical chart.', 8),
('sea_treasures', 'A dolphin keeps leading fishing boats to the same spot. Diving there reveals an old anchor with an inscription that matches a famous explorer''s lost journal entry.', 9),
('sea_treasures', 'The floorboards of an old seaside inn have ship names carved underneath. One name matches a vessel that disappeared with a cargo of musical instruments and a mystery.', 10),
('sea_treasures', 'A kite festival on the beach is interrupted when one kite snags on something buried in a dune. Unearthing it reveals a watertight barrel containing rolled-up treasure maps.', 11),
('sea_treasures', 'A submarine periscope from a museum starts working again and shows an underwater view of ruins that don''t match any known shipwreck in the area.', 12),
('sea_treasures', 'An old sailor teaches children to tie sailor knots. One particular knot, when unraveled in order, reveals a folded piece of parchment hidden inside the rope itself.', 13),
('sea_treasures', 'A beach bonfire reveals colored glass in the sand that forms a mosaic when arranged. The mosaic depicts a ship sailing toward a rock formation visible from the shore.', 14),
('sea_treasures', 'A whale watching tour spots markings on a whale''s back that match symbols found on an old portolan chart in the maritime museum. The symbols indicate a nearby underwater cavern.', 15),
('sea_treasures', 'The harbor master''s old logbook records a ship that arrived with no crew but a hold full of hand-drawn star charts. The charts correspond to an island chain nobody has mapped.', 16),
('sea_treasures', 'A sandcastle competition yields an unusual discovery: a child digging a moat hits a stone slab with a carved mermaid pointing toward the old pier.', 17),
('sea_treasures', 'A coastal cave accessible only during spring tides is covered in phosphorescent algae that spells words when the water rises. The words describe a path to a hidden grotto.', 18),
('sea_treasures', 'A fisherman''s old sweater, unraveled, reveals a thread pattern that is actually a knitting code used by sailors'' families to encode secret messages during wartime.', 19),
('sea_treasures', 'Storm waves wash away part of a cliff, revealing a smugglers'' tunnel with carved wooden signs. Each sign shows a different sea creature pointing deeper into the tunnel.', 20);

-- super_powers (20)
INSERT INTO scenario_plot_examples (scenario_card_id, setting, sort_order) VALUES
('super_powers', 'A child discovers they can talk to electrical appliances. The toaster reports strange power surges happening across the neighborhood, tracing back to an old substation.', 1),
('super_powers', 'During a thunderstorm, a sibling duo gets the ability to switch senses — one sees sounds, the other hears colors. They must combine abilities to find a lost pet.', 2),
('super_powers', 'A young athlete discovers they can run so fast that time slows down around them. During a race, they notice something happening in slow motion that nobody else can see.', 3),
('super_powers', 'A child who can shrink to the size of an ant explores the world beneath the school playground and discovers a tiny civilization building a monument.', 4),
('super_powers', 'A teenager realizes their drawings predict the weather. When they draw a rainbow over the town, the town experiences the most unusual weather event in its history.', 5),
('super_powers', 'A kid who can make plants grow super fast accidentally creates a vine bridge during recess. The bridge leads over the school fence to a hidden meadow with a secret.', 6),
('super_powers', 'A child discovers they can breathe underwater after falling into a fountain. Exploring the city''s underground waterways reveals a forgotten park beneath the streets.', 7),
('super_powers', 'A young person with the power to make objects weightless accidentally sends the school science fair project floating away. The chase leads to an unexpected discovery.', 8),
('super_powers', 'A kid who can understand animal languages overhears birds discussing a "great gathering" happening in the forest. No human has been invited — until now.', 9),
('super_powers', 'A child realizes they can project their thoughts as visible images. During show-and-tell, an image appears that the child doesn''t remember thinking — a memory from someone else.', 10),
('super_powers', 'A young person discovers they glow in the dark after eating certain fruits. Each fruit color gives a different glow, and one particular glow reveals hidden messages on old walls.', 11),
('super_powers', 'A child with super hearing picks up a faint melody coming from underground. Following the sound leads to a sealed chamber beneath the town library with instruments inside.', 12),
('super_powers', 'A kid who can copy any physical skill they see watches a documentary about acrobats — and suddenly can do flips. Watching a nature show about eagles gives them an unexpected result.', 13),
('super_powers', 'A child discovers their shadow can detach and act independently. The shadow wants to show them something in the old part of town that only shadows can see.', 14),
('super_powers', 'A young person with the ability to freeze small amounts of water discovers they can create tiny ice sculptures that hold messages, functioning like frozen letters.', 15),
('super_powers', 'A kid finds they can rewind time by exactly ten seconds. Using this ability sparingly, they prevent small accidents — until they witness something that needs more than ten seconds.', 16),
('super_powers', 'A child who can turn invisible discovers someone else in town has the same power. Finding each other becomes a game of invisible hide-and-seek with real stakes.', 17),
('super_powers', 'A young person realizes they can make any machine work just by touching it. An old broken radio in the attic turns on and receives a broadcast from a station that closed years ago.', 18),
('super_powers', 'A kid discovers that when they whistle a certain note, nearby objects rearrange into helpful formations — stairs, bridges, shelters — as if obeying a musical command.', 19),
('super_powers', 'A child with the power to make anything sticky or slippery at will uses this to set up a community obstacle course — but the course reveals a hidden tunnel entrance.', 20);

-- enchanted_forest (20)
INSERT INTO scenario_plot_examples (scenario_card_id, setting, sort_order) VALUES
('enchanted_forest', 'A path made of glowing mushrooms appears in the forest only during a full moon. Following it leads to a clearing where animals hold a council meeting.', 1),
('enchanted_forest', 'An ancient oak tree drops a single golden acorn at a child''s feet. Planting it overnight produces a sapling with a tiny door in its trunk.', 2),
('enchanted_forest', 'A stream in the woods flows uphill after a summer rain. Following it upstream reveals a hidden waterfall with a cave behind it filled with crystals that hum.', 3),
('enchanted_forest', 'A hedgehog wearing a tiny scarf leads a child off the main trail. They arrive at a moss-covered amphitheater where animals rehearse a play about the forest''s origin.', 4),
('enchanted_forest', 'A fallen log across a stream turns out to be a sleeping tree giant. It wakes gently, asks the time, and offers to carry the protagonist to the Forest Heart.', 5),
('enchanted_forest', 'Spider webs in the forest are woven with words this morning. Each web has a different word, and together they form a request: "Please bring back the singing.".', 6),
('enchanted_forest', 'Fireflies in a meadow arrange themselves into the shape of an arrow every evening. Following the arrow leads deeper into the woods where an old well whispers names.', 7),
('enchanted_forest', 'A child finds a bird''s nest made entirely of colorful ribbons and paper scraps. The paper scraps are pages from a fairy''s diary describing a lost celebration.', 8),
('enchanted_forest', 'A circle of stones in a clearing rearranges itself when nobody is watching. Setting up a camera reveals the stones are playing a slow-motion game of tag.', 9),
('enchanted_forest', 'Rain in the enchanted forest falls in different colors in different clearings. Collecting rainwater from each clearing and mixing them reveals a hidden image.', 10),
('enchanted_forest', 'A family of foxes moves into a hollow tree near the forest edge. The youngest fox keeps leaving small gifts — berries, feathers, polished stones — on a child''s doorstep.', 11),
('enchanted_forest', 'A tree with silver bark grows in the deepest part of the forest. Its leaves chime like bells in the wind, and the melody is a map if you listen carefully.', 12),
('enchanted_forest', 'Patches of forest floor bloom with flowers that match the season of whoever steps on them. One patch blooms with flowers from a season that doesn''t exist.', 13),
('enchanted_forest', 'An owl delivers a leaf-wrapped invitation to a child. Inside is a pressed flower and instructions to arrive at a certain stump at dawn for the "Smallest Festival."', 14),
('enchanted_forest', 'A bridge made of braided vines appears across a ravine that had none yesterday. Crossing it leads to a part of the forest where the trees are young and the air sparkles.', 15),
('enchanted_forest', 'Acorns in the forest have started sprouting immediately upon hitting the ground. A wise old badger explains the forest is growing faster because it is preparing for something important.', 16),
('enchanted_forest', 'A child discovers that echoing into a particular hollow tree lets them hear conversations from different parts of the forest — animals discussing a coming event.', 17),
('enchanted_forest', 'A tortoise with moss growing in patterns on its shell arrives at the forest edge. The patterns change daily and illustrate scenes from the next day.', 18),
('enchanted_forest', 'Morning dew on a spider web in a forest clearing forms a perfect tiny map of the surrounding woods, with one location marked by a dewdrop that won''t evaporate.', 19),
('enchanted_forest', 'A child follows a trail of bioluminescent flowers that bloom at dusk and close at dawn. The trail ends at a grove where an old tree grows fruit that tastes like memories.', 20);

-- inventors (20)
INSERT INTO scenario_plot_examples (scenario_card_id, setting, sort_order) VALUES
('inventors', 'A garage workshop where a child builds a robot from old appliances. The robot accidentally tunes into a frequency that reveals a neighbor is building something equally extraordinary.', 1),
('inventors', 'A science fair project — a homemade weather station — starts predicting events that aren''t weather-related. The next prediction points to the school''s oldest closet.', 2),
('inventors', 'A bicycle modified with a homemade engine takes off faster than expected and reaches a part of the countryside where an abandoned inventor''s shed holds unusual blueprints.', 3),
('inventors', 'A child invents a device that translates animal sounds into words. The first thing the family dog says is a detailed description of something buried in the backyard.', 4),
('inventors', 'A homemade periscope lets a child see around corners. Using it in the attic reveals a hidden compartment in the wall containing an old inventor''s notebook.', 5),
('inventors', 'A solar-powered toy car built for a competition develops a quirk: it always rolls toward the same spot in the schoolyard. Digging there reveals a capsule from a past student.', 6),
('inventors', 'A child builds a kite with a camera. The aerial photos reveal that the town''s buildings, seen from above, form a pattern that matches a famous mathematical sequence.', 7),
('inventors', 'A potato battery experiment produces more electricity than it should. Investigating why leads to the discovery that the soil in the garden has unusual mineral properties.', 8),
('inventors', 'A young inventor creates a machine that sorts objects by their age. Running family heirlooms through it reveals one item is far older than the family''s recorded history.', 9),
('inventors', 'A pair of walkie-talkies built from scratch picks up conversations from the past — not ghosts, but old radio waves bouncing back from the atmosphere decades later.', 10),
('inventors', 'A child invents goggles that let them see sound waves. Wearing them in the park reveals that the fountain''s splashing creates visible patterns that match sheet music.', 11),
('inventors', 'A homemade telescope using unusual lenses shows objects not visible through normal glass. Pointing it at the old water tower reveals writing that only appears through the special lens.', 12),
('inventors', 'A young tinkerer builds a machine that identifies what any material is made of. Scanning an ordinary-looking rock from the garden reveals it contains something extremely rare.', 13),
('inventors', 'A child''s invention for watering plants automatically starts watering specific spots in the yard more than others. Following the wet patches reveals they form a constellation pattern.', 14),
('inventors', 'A drone built for a school project captures footage of a bird carrying a shiny object into a nest. The object turns out to be a key that fits a lock in the school basement.', 15),
('inventors', 'A young inventor builds a boat from recycled materials for a lake race. Testing it reveals the lake has a current that shouldn''t exist, flowing toward a submerged structure.', 16),
('inventors', 'A child creates a color-mixing machine for art class that accidentally produces a paint color that glows under moonlight. Painting with it on the sidewalk reveals hidden markers.', 17),
('inventors', 'A prototype music box that plays tunes based on temperature changes starts playing rapidly when pointed toward the old theater, as if detecting bursts of heat from inside.', 18),
('inventors', 'A child builds a magnetism detector for a science project. Walking through the neighborhood, it spikes at a spot between two houses where a metal object is deeply buried.', 19),
('inventors', 'A homemade code machine that encrypts messages is accidentally set to decrypt instead. Feeding it the local newspaper reveals hidden messages embedded in certain articles.', 20);

-- jungle_adventures (20)
INSERT INTO scenario_plot_examples (scenario_card_id, setting, sort_order) VALUES
('jungle_adventures', 'A rope bridge deep in the jungle leads to a tree canopy village that doesn''t appear on any map. The villagers communicate using a system of bird calls.', 1),
('jungle_adventures', 'A river expedition discovers a tributary flowing in the wrong direction. Following it upstream reveals a lagoon with ancient stone carvings depicting star maps.', 2),
('jungle_adventures', 'An overgrown trail marked by blue flowers leads to a clearing with a perfectly preserved stone compass the size of a room. It still points to something.', 3),
('jungle_adventures', 'A parrot in the jungle repeats phrases in a language nobody recognizes. A linguist identifies it as an ancient trade language, and the phrases are directions.', 4),
('jungle_adventures', 'A sudden rainstorm reveals stepping stones under a shallow river that form a path to a waterfall. Behind the waterfall is a grotto with walls covered in hand prints.', 5),
('jungle_adventures', 'A botanist''s journal found in a hollow tree describes a flower that blooms once every ten years. It''s year ten, and the journal includes a map to the bloom site.', 6),
('jungle_adventures', 'A family of howler monkeys leads explorers away from their planned route. The detour reveals a sinkhole with a natural stone staircase spiraling down into a sunlit chamber.', 7),
('jungle_adventures', 'A hammock strung between two ancient trees starts swaying rhythmically without wind. The rhythm matches a pattern carved into the trees'' bark — a coded countdown.', 8),
('jungle_adventures', 'Butterflies in the jungle migrate in a straight line once a year, passing through a gap in the canopy that illuminates a hidden trail only on that specific day.', 9),
('jungle_adventures', 'An expedition campfire attracts unusual moths with wing patterns that resemble maps. Photographing and assembling the patterns reveals a route to a nearby ruin.', 10),
('jungle_adventures', 'A child helping at a jungle research station notices the resident chameleons all face the same direction at noon. Following their gaze leads to a moss-covered stone gate.', 11),
('jungle_adventures', 'After a landslide clears part of a hillside, the exposed rock face reveals a massive carved face looking upward. Its gaze points to a specific mountain peak.', 12),
('jungle_adventures', 'A network of natural hot springs in the jungle has pools of different temperatures that form a pattern. Standing at the center of the pattern reveals an acoustic sweet spot where whispers carry for miles.', 13),
('jungle_adventures', 'A fallen giant tree reveals a hollow interior containing pottery shards. When assembled, the pot shows a scene of a celebration held at a specific jungle landmark that still exists.', 14),
('jungle_adventures', 'A vine-covered stone archway in the jungle hums when the wind blows through it. Placing a hand on different stones changes the note, playing a melody that opens a hidden door.', 15),
('jungle_adventures', 'A jungle lake changes color with the seasons. This year it turns an unexpected color, and local guides say it last happened when something surfaced from the bottom decades ago.', 16),
('jungle_adventures', 'An old suspension bridge marked "unsafe" leads to a platform with a telescope pointed at a very specific spot in the canopy. Looking through it reveals a tree house.', 17),
('jungle_adventures', 'A trail of luminous fungi appears after heavy rain, leading from the river''s edge to a massive root system. Inside the root cave is a collection of carved animal figurines.', 18),
('jungle_adventures', 'A child discovers that a specific rhythm tapped on a buttress root echoes back differently — as if something underground is responding in kind.', 19),
('jungle_adventures', 'A zip line built by a previous expedition still works and crosses a valley to a plateau covered in grass that grows in spiral patterns, visible only from above.', 20);

-- scary_stories (20)
INSERT INTO scenario_plot_examples (scenario_card_id, setting, sort_order) VALUES
('scary_stories', 'An old lighthouse on a rocky cliff where the light turns on by itself every full moon. Strange footprints appear in the sand leading to a sealed door at the base.', 1),
('scary_stories', 'A traveling carnival arrives in town with a mirror maze where reflections move on their own. One reflection waves at the protagonist and points toward a hidden door.', 2),
('scary_stories', 'A grandfather''s antique music box plays a melody nobody recognizes. When the tune plays, objects in the room rearrange themselves into a map.', 3),
('scary_stories', 'A forest path that only appears on foggy mornings, leading to an overgrown garden with statues that seem to change position when not being watched.', 4),
('scary_stories', 'An old school building closed for decades where children''s laughter echoes at dusk. A janitor''s logbook reveals a mystery from 50 years ago that was never solved.', 5),
('scary_stories', 'A grandmother''s basement has a door that was always locked. When the key is finally found inside a family photo album, the door opens to a room that shouldn''t exist.', 6),
('scary_stories', 'A toy shop that appears between two buildings overnight and is gone by morning. Children who visited describe the same toy — one that whispered their name.', 7),
('scary_stories', 'A tree in the park is the only one that doesn''t lose its leaves in winter. At night, the leaves rustle words that sound like someone reading from an old diary.', 8),
('scary_stories', 'A snow globe found at a yard sale shows a scene that changes every time you shake it. One scene shows the protagonist''s own house — from the inside.', 9),
('scary_stories', 'A clock in the living room starts counting backward at midnight. When it reaches zero, a drawer in the old desk pops open, revealing a letter addressed to the protagonist.', 10),
('scary_stories', 'A stray cat leads a child to a boarded-up well in the woods. Dropping a stone produces no splash — but a voice echoes back asking "Is someone there?"', 11),
('scary_stories', 'A campsite near a lake where tents unzip themselves at 3 AM. Flashlight beams reveal writing on the morning dew that vanishes when the sun rises.', 12),
('scary_stories', 'A photograph found in a library book shows a group of children standing in front of the library — in clothes from the 1940s. One of them is holding today''s newspaper.', 13),
('scary_stories', 'An echo in a canyon repeats words that weren''t spoken. A child shouts "hello" and hears back a sentence that sounds like a clue to a very old riddle.', 14),
('scary_stories', 'A mailbox at an abandoned house still receives letters. The letters are addressed to different people but all say the same thing: "Please come to the garden at dusk."', 15),
('scary_stories', 'A puppet theater in the town square performs a show with no puppeteer. The story it tells is about a child who looks and sounds exactly like the protagonist.', 16),
('scary_stories', 'A rainstorm fills puddles that reflect a sky different from the one overhead — with stars visible even though it''s daytime. Stepping in a puddle leads to a foggy meadow.', 17),
('scary_stories', 'A board game found in the attic has pieces that move on their own to the correct squares. Finishing the game reveals a compartment in the board with a rolled-up note inside.', 18),
('scary_stories', 'An old radio in a thrift shop only plays one station — a broadcast from decades ago that describes events happening in the town right now.', 19),
('scary_stories', 'A cave behind a waterfall has walls that glow faintly with handprints. Placing a hand on one makes the glow brighten and a soft humming sound fills the cave.', 20);
