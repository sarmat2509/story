/**
 * useAlignmentSync Hook (M6)
 * Synchronizes audio playback position with text sentences and words
 * 
 * Features:
 * - Sentence-level highlighting
 * - Word-level underline positioning
 * - Efficient parsing with useMemo
 * - Lead time for anticipatory highlighting (100ms ahead)
 */

import { useMemo } from 'react';
import type { AlignmentData } from '@kazka/shared';

// Lead time in seconds - highlight text 100ms before audio reaches it
// This improves UX by anticipating the audio and avoiding lag perception
const LEAD_TIME = 0.1; // 100ms

/**
 * Word with timing and position within sentence
 */
export interface WordWithTiming {
  text: string;
  start: number;
  end: number;
  confidence?: number;
  indexInSentence: number; // Position within sentence (0-based)
}

/**
 * Sentence with timing and words
 */
export interface Sentence {
  text: string;
  startIndex: number;      // Character position in fullText
  endIndex: number;        // Character position in fullText
  startTime: number;       // Audio time (seconds)
  endTime: number;         // Audio time (seconds)
  words: WordWithTiming[]; // Words within this sentence
  sceneIndex: number;      // Which scene this sentence belongs to
}

/**
 * Alignment sync result
 */
export interface AlignmentSyncResult {
  activeSentenceIndex: number | null;
  activeWordIndex: number | null; // Word index within active sentence
  sentences: Sentence[];
}

/**
 * Hook to sync audio position with text sentences and words
 * 
 * @param fullText - Full story text
 * @param alignmentData - Alignment data from API (optional)
 * @param currentPosition - Current audio position in seconds
 * @param sceneTexts - Cleaned scene texts (audio tags already removed)
 * @returns Active sentence/word indices and parsed sentences
 */
export function useAlignmentSync(
  fullText: string,
  alignmentData: AlignmentData | null | undefined,
  currentPosition: number,
  sceneTexts: string[] = []
): AlignmentSyncResult {
  // Apply lead time - look ahead 100ms for anticipatory highlighting
  const adjustedPosition = currentPosition + LEAD_TIME;
  
  // Parse sentences and map words to them (memoized for performance)
  const sentences = useMemo(() => {
    if (!alignmentData || !fullText) {
      console.log('[useAlignmentSync] No alignment data or fullText');
      return [];
    }
    
    const parsed = parseSentencesWithWords(fullText, alignmentData, sceneTexts);
    console.log('[useAlignmentSync] Parsed sentences:', {
      sentenceCount: parsed.length,
      firstSentence: parsed[0]?.text.substring(0, 50),
      wordCount: alignmentData.words.length,
      scenesProvided: sceneTexts.length,
    });
    return parsed;
  }, [fullText, alignmentData, sceneTexts]);
  
  // Find active sentence based on adjusted position (with lead time)
  const activeSentenceIndex = useMemo(() => {
    if (sentences.length === 0) {
      return null;
    }
    
    const index = sentences.findIndex(
      sentence => adjustedPosition >= sentence.startTime && adjustedPosition < sentence.endTime
    );
    
    if (index === -1 && sentences.length > 0 && adjustedPosition > 0) {
      const first = sentences[0];
      const last = sentences[sentences.length - 1];
      // Find gaps between consecutive sentences
      const gaps = sentences.slice(0, -1).reduce<string[]>((acc, s, i) => {
        const next = sentences[i + 1];
        if (s.endTime < next.startTime) {
          acc.push(`[${i}→${i + 1}] ${s.endTime.toFixed(3)}-${next.startTime.toFixed(3)}`);
        }
        return acc;
      }, []);
      console.log('[useAlignmentSync] NO SENTENCE for position:', {
        adjustedPosition: adjustedPosition.toFixed(3),
        range: `${first.startTime.toFixed(3)} — ${last.endTime.toFixed(3)}`,
        totalSentences: sentences.length,
        gaps: gaps.length > 0 ? gaps : 'none',
      });
    }
    
    return index >= 0 ? index : null;
  }, [sentences, adjustedPosition]);
  
  // Find active word within active sentence (with lead time)
  const activeWordIndex = useMemo(() => {
    if (activeSentenceIndex === null) {
      return null;
    }
    
    const activeSentence = sentences[activeSentenceIndex];
    if (!activeSentence || activeSentence.words.length === 0) {
      return null;
    }
    
    // First try exact match
    let index = activeSentence.words.findIndex(
      word => adjustedPosition >= word.start && adjustedPosition < word.end
    );
    
    // If no exact match, find the closest word that has already started
    if (index === -1) {
      // Find the last word that has started but not ended yet (with small tolerance)
      const tolerance = 0.05; // 50ms tolerance for smoother transitions (reduced since we have lead time)
      index = activeSentence.words.findIndex(
        (word, i) => {
          const hasStarted = adjustedPosition >= word.start - tolerance;
          const nextWordNotStarted = i === activeSentence.words.length - 1 || 
                                     adjustedPosition < activeSentence.words[i + 1].start - tolerance;
          return hasStarted && nextWordNotStarted;
        }
      );
    }
    
    if (index === -1 && activeSentence.words.length > 0) {
      const firstW = activeSentence.words[0];
      const lastW = activeSentence.words[activeSentence.words.length - 1];
      console.log('[useAlignmentSync] NO WORD in sentence:', {
        adjustedPosition: adjustedPosition.toFixed(3),
        sentenceIdx: activeSentenceIndex,
        sentenceText: activeSentence.text.substring(0, 60),
        sentenceRange: `${activeSentence.startTime.toFixed(3)}-${activeSentence.endTime.toFixed(3)}`,
        wordCount: activeSentence.words.length,
        firstWord: `"${firstW.text}" ${firstW.start.toFixed(3)}-${firstW.end.toFixed(3)}`,
        lastWord: `"${lastW.text}" ${lastW.start.toFixed(3)}-${lastW.end.toFixed(3)}`,
      });
    }
    
    return index >= 0 ? index : null;
  }, [sentences, activeSentenceIndex, adjustedPosition]);
  
  return {
    activeSentenceIndex,
    activeWordIndex,
    sentences,
  };
}

/**
 * Parse full text into sentences and map alignment words to them.
 * Scene boundaries (\n\n) are forced as sentence boundaries so that
 * no sentence ever spans across two scenes.
 */
function parseSentencesWithWords(
  fullText: string,
  alignmentData: AlignmentData,
  sceneTexts: string[]
): Sentence[] {
  console.log('[parseSentencesWithWords] Starting parse:', {
    fullTextLength: fullText.length,
    wordCount: alignmentData.words.length,
    firstWords: alignmentData.words.slice(0, 5).map(w => w.text),
    sceneCount: sceneTexts.length,
  });
  
  // CRITICAL: Clean text from audio tags before processing
  // Alignment was generated from cleaned text, so we must match the same format
  const cleanedText = fullText.replace(/\[[\w\s]+\]/g, '').trim();
  
  console.log('[parseSentencesWithWords] Text cleaned:', {
    originalLength: fullText.length,
    cleanedLength: cleanedText.length,
    removedChars: fullText.length - cleanedText.length,
    firstChars: cleanedText.substring(0, 100),
  });
  
  // 0. Compute scene offset ranges in cleanedText
  // Scene texts are joined with \n\n, so we can calculate where each scene starts/ends
  const sceneRanges: Array<{ start: number; end: number }> = [];
  if (sceneTexts.length > 0) {
    let offset = 0;
    for (let i = 0; i < sceneTexts.length; i++) {
      const sceneClean = sceneTexts[i].replace(/\[[\w\s]+\]/g, '').trim();
      // Find the scene text in cleanedText starting from current offset
      const pos = cleanedText.indexOf(sceneClean, offset);
      if (pos !== -1) {
        sceneRanges.push({ start: pos, end: pos + sceneClean.length });
        offset = pos + sceneClean.length;
      } else {
        // Fallback: estimate position
        sceneRanges.push({ start: offset, end: offset + sceneClean.length });
        offset += sceneClean.length + 2; // +2 for \n\n
      }
    }
    console.log('[parseSentencesWithWords] Scene ranges:', sceneRanges.map((r, i) => ({
      scene: i, start: r.start, end: r.end, len: r.end - r.start,
    })));
  }
  
  // Helper: find which scene a character position belongs to
  const getSceneIndexForPos = (pos: number): number => {
    for (let i = 0; i < sceneRanges.length; i++) {
      if (pos >= sceneRanges[i].start && pos < sceneRanges[i].end) {
        return i;
      }
    }
    // If past all scenes, assign to last scene
    if (sceneRanges.length > 0 && pos >= sceneRanges[sceneRanges.length - 1].end) {
      return sceneRanges.length - 1;
    }
    return 0;
  };
  
  // 1. Collect sentence boundaries from punctuation
  // Include trailing closing quotes in the delimiter so they stay with their sentence
  const sentenceRegex = /[.!?]+[»"'"\)\]]*\s*/g;
  const boundarySet = new Set<number>();
  boundarySet.add(0);
  let match;
  
  while ((match = sentenceRegex.exec(cleanedText)) !== null) {
    boundarySet.add(match.index + match[0].length);
  }
  
  // 2. Force \n\n as additional sentence boundaries (scene boundaries)
  const newlineRegex = /\n\n+/g;
  while ((match = newlineRegex.exec(cleanedText)) !== null) {
    // End of text before newlines = boundary
    boundarySet.add(match.index);
    // Start of text after newlines = boundary
    boundarySet.add(match.index + match[0].length);
  }
  
  // Add end of text
  boundarySet.add(cleanedText.length);
  
  // Sort and deduplicate
  const sentenceBoundaries = Array.from(boundarySet).sort((a, b) => a - b);
  
  console.log('[parseSentencesWithWords] Sentence boundaries found:', {
    boundaryCount: sentenceBoundaries.length,
    first5: sentenceBoundaries.slice(0, 5),
  });
  
  // 3. Create sentence objects with character positions and scene assignment
  const sentences: Sentence[] = [];
  
  for (let i = 0; i < sentenceBoundaries.length - 1; i++) {
    const startIndex = sentenceBoundaries[i];
    const endIndex = sentenceBoundaries[i + 1];
    const sentenceText = cleanedText.substring(startIndex, endIndex).trim();
    
    if (sentenceText.length === 0) {
      continue; // Skip empty sentences
    }
    
    // Find actual start of trimmed text for accurate scene assignment
    const trimmedStart = cleanedText.indexOf(sentenceText, startIndex);
    const assignedScene = sceneRanges.length > 0
      ? getSceneIndexForPos(trimmedStart !== -1 ? trimmedStart : startIndex)
      : 0;
    
    sentences.push({
      text: sentenceText,
      startIndex,
      endIndex,
      startTime: 0, // Will be calculated from words
      endTime: 0,   // Will be calculated from words
      words: [],
      sceneIndex: assignedScene,
    });
  }
  
  console.log('[parseSentencesWithWords] Sentences created:', {
    sentenceCount: sentences.length,
    first3: sentences.slice(0, 3).map(s => ({ 
      text: s.text.substring(0, 50),
      start: s.startIndex,
      end: s.endIndex,
      scene: s.sceneIndex,
    })),
  });
  
  // 4. Map alignment words to sentences
  let currentSentenceIdx = 0;
  let charPositionInCleanedText = 0;
  let wordsSkipped = 0;
  let wordsMapped = 0;
  
  for (const word of alignmentData.words) {
    // Skip whitespace-only words
    if (word.text.trim().length === 0) {
      wordsSkipped++;
      continue;
    }
    
    // Find which sentence this word belongs to by searching in cleanedText
    const wordPosition = cleanedText.indexOf(word.text, charPositionInCleanedText);
    
    if (wordPosition === -1) {
      // Word not found in text (might be cleaned differently)
      console.warn('[parseSentencesWithWords] Word not found in text:', word.text);
      continue;
    }
    
    charPositionInCleanedText = wordPosition + word.text.length;
    
    // Find which sentence contains this word
    while (
      currentSentenceIdx < sentences.length &&
      wordPosition >= sentences[currentSentenceIdx].endIndex
    ) {
      currentSentenceIdx++;
    }
    
    if (currentSentenceIdx >= sentences.length) {
      break; // No more sentences
    }
    
    const sentence = sentences[currentSentenceIdx];
    
    if (wordPosition >= sentence.startIndex && wordPosition < sentence.endIndex) {
      // Add word to sentence
      sentence.words.push({
        text: word.text,
        start: word.start,
        end: word.end,
        confidence: word.confidence,
        indexInSentence: sentence.words.length,
      });
      
      wordsMapped++;
      
      // Update sentence timing
      if (sentence.words.length === 1) {
        // First word - set start time
        sentence.startTime = word.start;
      }
      sentence.endTime = word.end; // Always update end time
    }
  }
  
  console.log('[parseSentencesWithWords] Word mapping complete:', {
    totalWords: alignmentData.words.length,
    wordsSkipped: wordsSkipped,
    wordsMapped: wordsMapped,
    sentencesWithWords: sentences.filter(s => s.words.length > 0).length,
  });
  
  // 5. Filter out sentences without words (unmapped)
  const result = sentences.filter(s => s.words.length > 0);
  
  console.log('[parseSentencesWithWords] Final result:', {
    sentenceCount: result.length,
    first3WithWords: result.slice(0, 3).map(s => ({
      text: s.text.substring(0, 50),
      wordCount: s.words.length,
      startTime: s.startTime,
      endTime: s.endTime,
      scene: s.sceneIndex,
    })),
  });
  
  return result;
}
