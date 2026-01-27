# Characters API

## Overview

Characters represent family-wide personas (pets, family members, friends, imaginary friends) that can be included in stories. Characters are stored as a flat list per family - no pre-linking to children in Milestone 2.

## Character Types

1. **`pet`** - Family pets (cats, dogs, etc.)
2. **`family_member`** - Grandparents, relatives
3. **`friend`** - Child's friends
4. **`neighbor`** - Neighbors, community members
5. **`imaginary_friend`** - Imaginary creatures (free text!)

## Type-Specific Traits

### Pet Characteristics
- **Breed**: Cat/dog breeds or generic
- **Fur**: Color, pattern, length
- **Size**: Tiny to giant
- **Eyes**: Color options
- **Features**: Fluffy tail, white paws, etc.

All fields use **strict enums** from `petTraits.ts`.

### Human Characteristics
- **Age Range**: Child, teenager, adult, elderly
- **Hair**: Color and style
- **Build**: Height and body type
- **Clothing**: Style preferences
- **Features**: Glasses, beard, etc.

All fields use **strict enums** from `humanTraits.ts`.

### Imaginary Friend Characteristics
- **Species**: Free text (dragon, fairy, cloud creature, etc.)
- **Colors**: Free text (rainbow, sparkly, glowing, etc.)
- **Size**: Free text (tiny, giant, changes size, etc.)
- **Magical Features**: Free text array (wings, sparkles, rainbow horns)
- **Custom Description**: Full free text description

All fields are **pure free text** with UI suggestions for inspiration.

## API Endpoints

### GET /api/v1/characters

List all family characters, optionally filtered by type.

**Authentication:** Required (JWT)

**Query Parameters:**
- `type` (optional): Filter by character type

**Examples:**
```bash
# Get all characters
GET /api/v1/characters

# Get only pets
GET /api/v1/characters?type=pet

# Get only imaginary friends
GET /api/v1/characters?type=imaginary_friend
```

**Response:**
```json
{
  "status": "success",
  "characters": [
    {
      "id": "uuid",
      "name": "Мурчик",
      "type": "pet",
      "appearanceTraits": {
        "breed": "persian",
        "furColor": "orange_tabby",
        "furLength": "long",
        "size": "medium",
        "eyeColor": "green",
        "distinctiveFeatures": ["fluffy_tail", "white_paws"]
      },
      "personality": {
        "traits": ["playful", "lazy"],
        "favoriteActivities": ["sleeping", "chasing_toys"]
      },
      "description": "Великий рудий кіт з пухнастим хвостом",
      "isActive": true,
      "createdAt": "2026-01-25T...",
      "updatedAt": "2026-01-25T..."
    }
  ]
}
```

### POST /api/v1/characters

Create a new character with type-specific validation.

**Authentication:** Required (JWT)

**Request Body (Pet):**
```json
{
  "name": "Мурчик",
  "type": "pet",
  "appearanceTraits": {
    "breed": "persian",
    "furColor": "orange_tabby",
    "furLength": "long",
    "size": "medium",
    "eyeColor": "green",
    "distinctiveFeatures": ["fluffy_tail", "white_paws"]
  },
  "personality": {
    "traits": ["playful", "lazy"],
    "favoriteActivities": ["sleeping"]
  },
  "description": "Великий рудий кіт з пухнастим хвостом"
}
```

**Request Body (Family Member):**
```json
{
  "name": "Бабуся Оля",
  "type": "family_member",
  "appearanceTraits": {
    "ageRange": "elderly",
    "hairColor": "grey",
    "hairStyle": "short",
    "clothing": "traditional",
    "height": "short",
    "distinctiveFeatures": ["glasses", "kind_smile"]
  },
  "personality": {
    "traits": ["kind", "wise", "patient"],
    "favoriteActivities": ["cooking", "storytelling"]
  }
}
```

**Request Body (Imaginary Friend - Free Text!):**
```json
{
  "name": "Дракончик Райдужко",
  "type": "imaginary_friend",
  "appearanceTraits": {
    "species": "dragon",
    "primaryColor": "rainbow",
    "secondaryColor": "gold",
    "size": "tiny",
    "magicalFeatures": ["wings", "sparkles", "rainbow_horns"],
    "customDescription": "Маленький дракон з райдужними рогами та золотими крилами, який світиться вночі"
  },
  "personality": {
    "traits": ["playful", "magical", "protective"],
    "favoriteActivities": ["flying", "making rainbows"]
  }
}
```

**Validation:**
- `name`: 1-100 characters (required)
- `type`: Must be valid character type (required)
- `referencePhotos`: Max 5, NOT allowed for `imaginary_friend`
- `appearanceTraits`: Type-specific validation (see below)
- `description`: Max 500 characters (optional)

**Type-Specific Validation:**

- **Pet**: All trait values must be from predefined enums
- **Human**: All trait values must be from predefined enums
- **Imaginary**: All trait values are free text (no enum validation)

**Response:** `201 Created` with character object

**Errors:**
- `400` - Validation failed (invalid enum values, wrong structure)
- `400` - Reference photos not allowed for imaginary_friend

### GET /api/v1/characters/:id

Get a single character by ID.

**Authentication:** Required (JWT)

**Ownership:** User must own the character

**Response:** `200 OK` with character object

**Errors:**
- `404` - Character not found

### PATCH /api/v1/characters/:id

Update an existing character.

**Authentication:** Required (JWT)

**Ownership:** User must own the character

**Request Body:** Same as POST, all fields optional

**Response:** `200 OK` with updated character

**Errors:**
- `404` - Character not found
- `400` - Validation failed

### DELETE /api/v1/characters/:id

Delete a character (soft delete).

**Authentication:** Required (JWT)

**Ownership:** User must own the character

**Response:** `204 No Content`

**Errors:**
- `404` - Character not found

**Note:** Soft delete - `isActive` set to `false`, data retained.

## Character Trait Dictionaries

### GET /api/v1/dictionaries/character-traits?type=pet

Get pet-specific trait enums for UI dropdowns.

**Authentication:** None (public)

**Response:**
```json
{
  "status": "success",
  "type": "pet",
  "dictionaries": {
    "petTypes": ["cat", "dog", "hamster", "rabbit", "..."],
    "breeds": {
      "cat": ["mixed", "persian", "siamese", "..."],
      "dog": ["mixed", "labrador", "german_shepherd", "..."]
    },
    "furColors": ["black", "white", "grey", "orange", "orange_tabby", "..."],
    "furPatterns": ["solid", "striped", "spotted", "..."],
    "furLengths": ["hairless", "short", "medium", "long", "curly"],
    "sizes": ["tiny", "small", "medium", "large", "giant"],
    "eyeColors": ["blue", "green", "yellow", "amber", "brown", "..."],
    "personalityTraits": ["playful", "lazy", "curious", "friendly", "..."],
    "activities": ["sleeping", "playing", "chasing_toys", "..."],
    "distinctiveFeatures": ["fluffy_tail", "short_tail", "white_paws", "..."]
  }
}
```

### GET /api/v1/dictionaries/character-traits?type=family_member

Get human character trait enums.

**Response:**
```json
{
  "status": "success",
  "type": "family_member",
  "dictionaries": {
    "ageRanges": ["child", "teenager", "adult", "middle_aged", "elderly"],
    "hairColors": ["blonde", "brown", "black", "grey", "..."],
    "hairStyles": ["short", "medium", "long", "bald", "curly", "..."],
    "eyeColors": ["blue", "green", "brown", "..."],
    "skinTones": ["very_light", "light", "medium", "tan", "brown", "..."],
    "heights": ["very_short", "short", "average", "tall", "very_tall"],
    "builds": ["slim", "average", "athletic", "heavyset"],
    "clothingStyles": ["casual", "formal", "sporty", "traditional", "..."],
    "distinctiveFeatures": ["glasses", "beard", "mustache", "wrinkles", "..."]
  }
}
```

### GET /api/v1/dictionaries/character-traits?type=imaginary_friend

Get imaginary friend suggestions (NOT validation enums!).

**Response:**
```json
{
  "status": "success",
  "type": "imaginary_friend",
  "note": "All fields are free text. Suggestions provided for UI inspiration only.",
  "suggestions": {
    "species": ["dragon", "fairy", "unicorn", "robot", "monster", "alien", "..."],
    "colors": ["rainbow", "gold", "silver", "sparkly", "transparent", "glowing", "..."],
    "sizes": ["tiny", "small", "medium", "large", "giant", "changes_size", "..."],
    "magicalFeatures": ["wings", "horns", "tail", "sparkles", "glow", "invisibility", "..."]
  },
  "availableFields": {
    "species": { "type": "text", "maxLength": 100 },
    "primaryColor": { "type": "text", "maxLength": 50 },
    "secondaryColor": { "type": "text", "maxLength": 50 },
    "size": { "type": "text", "maxLength": 50 },
    "magicalFeatures": {
      "type": "text_array",
      "maxItems": 10,
      "maxLength": 50
    },
    "customDescription": { "type": "text", "maxLength": 500 }
  }
}
```

## Flat Character List (No Pre-Linking)

In Milestone 2, characters are NOT linked to children. Characters are a family-wide list.

**Story creation (Milestone 3+) will:**
1. Select which children the story is for (0+)
2. Select which characters appear in THIS story (0+)
3. Create `story_characters` junction table

**Benefits:**
- Бабуся can appear in stories for Оленка, Максим, or both
- No duplication of character data
- Flexible story composition

## Example Workflows

### Create Pet Character
```bash
curl -X POST http://localhost:3000/api/v1/characters \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Мурчик",
    "type": "pet",
    "appearanceTraits": {
      "breed": "persian",
      "furColor": "orange_tabby",
      "size": "medium"
    },
    "personality": {
      "traits": ["playful", "lazy"]
    }
  }'
```

### Create Imaginary Friend (Free Text!)
```bash
curl -X POST http://localhost:3000/api/v1/characters \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Хмаринка з Очима",
    "type": "imaginary_friend",
    "appearanceTraits": {
      "species": "жива хмаринка",
      "primaryColor": "біла пухнаста",
      "size": "як велика подушка",
      "magicalFeatures": ["великі добрі очі", "м'\''який голос", "може літати"],
      "customDescription": "Біла пухнаста хмаринка з великими добрими очима, яка допомагає дітям заснути"
    }
  }'
```

### List Only Imaginary Friends
```bash
curl http://localhost:3000/api/v1/characters?type=imaginary_friend \
  -H "Authorization: Bearer <token>"
```

## Validation by Type

### Pet Validation
- Strict enum validation for all appearance fields
- Must use values from dictionaries endpoint
- Example: `furColor` must be one of `FUR_COLORS`

### Human Validation
- Strict enum validation for all appearance fields
- Must use values from dictionaries endpoint
- Example: `ageRange` must be one of `AGE_RANGES`

### Imaginary Validation
- **NO enum validation** - pure free text
- Only length/count limits enforced
- UI shows random suggestions but accepts any text
- Maximum creativity: "райдужні рога", "робот з серцем"

## Future: Story Integration (Milestone 3+)

When creating a story, parents will:
1. Select target children (0-4)
2. Select participating characters from flat family list (0-N)
3. System creates `story_characters` junction table

This enables:
- Stories without specific children (generic tales)
- Stories without predefined characters (AI-generated)
- Stories with any combination of family characters
- Same character in multiple stories for different children
