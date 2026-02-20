// To run this code you need to install the following dependencies:
// npm install @google/genai mime
// npm install -D @types/node

import {
    GoogleGenAI,
  } from '@google/genai';
  import mime from 'mime';
  import { writeFile } from 'fs';
  
  function saveBinaryFile(fileName: string, content: Buffer) {
    writeFile(fileName, content, 'utf8', (err) => {
      if (err) {
        console.error(`Error writing file ${fileName}:`, err);
        return;
      }
      console.log(`File ${fileName} saved to file system.`);
    });
  }
  
  async function main() {
    const ai = new GoogleGenAI({
      apiKey: process.env['GEMINI_API_KEY'],
    });
    const config = {
      imageConfig: {
        aspectRatio: "9:16",
        imageSize: "1K",
        personGeneration: "",
      },
      responseModalities: [
          'IMAGE',
          'TEXT',
      ],
    };
    const model = 'gemini-3-pro-image-preview';
    const contents = [
      {
        role: 'user',
        parts: [
          {
            inlineData: {
              data: '/9j/4AAQSkZJRgAB...',
              mimeType: `image/jpeg`,
            },
          },
          {
            inlineData: {
              data: '/9j/4AAQSkZJR...',
              mimeType: `image/jpeg`,
            },
          },
          {
            text: `STYLE (must match): nocturnal atmospheric illustration, deep indigo and violet tones, glowing warm highlights, soft blurred edges, peaceful silence, stippling texture, magical night vibe, inspired by Goodnight Moon, high contrast between dark and light
  FORMAT: Children's book illustration, single scene, no speech bubbles, no captions, no text.
  SETTING: Марічка's cozy bedroom. The window on the left side of the room shows a slightly dull and sad-looking garden outside. Drawings are still on the walls.
  CAMERA / COMPOSITION: Medium shot from behind Марічка, looking towards the window. Марічка: foreground center, standing near the window, pointing outside with a concerned expression. Гіглі: right, floating beside Марічка, with a thoughtful expression, looking at the garden. Бінбон: left, slightly behind Марічка, looking curious and a little puzzled.
  CHARACTERS (keep consistent):
  1.IMPORTANT: Use the attached reference image of "Бінбон" and keep the same appearance: This imaginary creature has an elongated, oval body resembling a cylinder, and appears to be of medium or large size. Its head and upper torso are yellow, and on top of its head is a wavy, reddish-brown crest. Its face features a large, teardrop-shaped blue nose and a wide black smile with many small, sharp white teeth, as well as two small, round eyes on stalks protruding from the sides of its head. The creature is dressed in a blue shirt covering its midsection and green pants, from which emerge four thin green legs, each ending in a yellow rounded foot. It also has two thin blue arms ending in yellow palms with three black claw-fingers, and a small black navel is visible on the yellow part of its belly.
  2. IMPORTANT: Use the attached reference image of "Гіглі" and keep the same appearance: In the middle of the picture is a medium-sized square creature with bright colors. Its body-head is divided into four large triangles: yellow in the top left, purple in the top right, blue in the bottom left, and green in the bottom right. The central part of the body is white, adorned with numerous small multicolored specks of green, blue, purple, and golden colors. The creature has one distinct rectangular eye with a black dot, located on the right side of the white part of its face, as well as a small round nose with two nostrils. A wide black smile reveals several white, flat teeth. Two large pink ears protrude from the sides of the square body, each adorned with a golden hoop earring. On top of its head is a small reddish-brown tuft of hair, and two thin arms with small three-fingered hands extend from the sides of its body. At the bottom, the creature has three thin legs: two on the right and one on the left, ending in wavy feet, with the central leg being zigzag-shaped.
  3. Марічка: A kind and imaginative girl with bright, curious brown eyes. She has long, wavy brown hair tied with a colorful red ribbon. She wears comfortable blue overalls over a yellow and white striped t-shirt and practical red sneakers.
  CHANGE ONLY: scene background, character poses/positions, actions as described below.
  NEVER add facial features or body parts that are not present in the reference images.
  ACTION / SITUATION: Mood: neutral
  LIGHTING: Daylight from the window is a bit muted, reflecting the sad mood of the garden. Soft, even lighting inside the room.
  QUALITY CONTROLS: safe for children, friendly, positive, age-appropriate, friendly atmosphere, no scary or threatening elements, no text or letters in the image.`,
          },
        ],
      },
      {
        role: 'model',
        parts: [
          {
            text: `**Defining the Illustration Parameters**
  
  I'm now focusing on defining the specific parameters for the illustration. I am leaning toward a nocturnal, atmospheric style, working with deep indigo and violet tones with glowing highlights. I am aiming for soft, blurred edges and a peaceful, silent feel with a stippling texture. I'm hoping to evoke a magical night vibe.
  
  
  **Refining the Composition's Details**
  
  I've refined the composition details, focusing on the scene's characters and their interactions within Марічка's bedroom. I'm specifying their positions and expressions relative to the window and the sad garden. I'm considering moonlight and lamplight for the lighting. I'm focusing on the characters themselves, including their position, action and appearance.
  
  
  `,
          },
          {
            inlineData: {
              data: '/9j/4AAQ...',
              mimeType: `image/jpeg`,
            },
          },
          {
            text: `**Assessing Nocturnal Depiction**
  
  I am now carefully reviewing the generated image against the initial user specifications. I am meticulously analyzing the incorporation of the requested stylistic elements, with specific attention to the intended atmospheric depth and tonal warmth. I am focused on evaluating the successful integration of all requested details.
  
  
  **Evaluating Composition Accuracy**
  
  I am now comparing the generated scene to the prompt's details regarding character placement and setting. I am confirming that the scene successfully portrays Марічка at the window, the garden, and the characters Гіг лі and Бінбон. My focus is on verifying accurate integration of all provided elements in the described bedroom environment.
  
  
  `,
          },
          {
            inlineData: {
              data: '/9j/4AAQSkZJRg...',
              mimeType: `image/jpeg`,
            },
          },
        ],
      },
      {
        role: 'user',
        parts: [
          {
            text: `INSERT_INPUT_HERE`,
          },
        ],
      },
    ];
  
    const response = await ai.models.generateContentStream({
      model,
      config,
      contents,
    });
    let fileIndex = 0;
    for await (const chunk of response) {
      if (!chunk.candidates || !chunk.candidates[0].content || !chunk.candidates[0].content.parts) {
        continue;
      }
      if (chunk.candidates?.[0]?.content?.parts?.[0]?.inlineData) {
        const fileName = `ENTER_FILE_NAME_${fileIndex++}`;
        const inlineData = chunk.candidates[0].content.parts[0].inlineData;
        const fileExtension = mime.getExtension(inlineData.mimeType || '');
        const buffer = Buffer.from(inlineData.data || '', 'base64');
        saveBinaryFile(`${fileName}.${fileExtension}`, buffer);
      }
      else {
        console.log(chunk.text);
      }
    }
  }
  
  main();
  
  
  