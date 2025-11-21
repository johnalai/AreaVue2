import { GoogleGenAI } from "@google/genai";
import { Survey } from '../types';
import { calculateArea, calculatePerimeter, latLngToUtm } from './geoService';

export const analyzeSurvey = async (survey: Survey): Promise<string> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    return "API Key is missing. Please configure the environment.";
  }

  const areaSqM = calculateArea(survey.points);
  const perimeter = calculatePerimeter(survey.points);
  let utmInfo = "";
  if (survey.points.length > 0) {
      const utm = latLngToUtm(survey.points[0].lat, survey.points[0].lng);
      utmInfo = `UTM Zone ${utm.zone}${utm.hemi}`;
  }

  const prompt = `
    I have performed a land survey with the following data:
    - Number of Points: ${survey.points.length}
    - Approximate Area: ${areaSqM.toFixed(1)} sq meters (${(areaSqM * 0.000247105).toFixed(3)} acres)
    - Perimeter: ${perimeter.toFixed(1)} meters
    - Location Reference: ${utmInfo}
    
    Based on this geometry and the approximate size, provide a brief professional summary. 
    Include:
    1. Estimated land use suitability.
    2. Geometry analysis (is it irregular, rectangular?).
    3. Staking advice if I were to subdivide this.
    
    Keep it concise (under 200 words). Format with markdown.
  `;

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    return response.text || "Unable to generate analysis.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "Error connecting to AI Assistant. Please check your connection.";
  }
};
