// Import all custom font files
import AutografFont from "../fonts/AutografPersonalUseOnly-mOBm.ttf";
import DannyBrasscoFont from "../fonts/DannyBrassco-rv0K9.ttf";
import MotterdamFont from "../fonts/Motterdam-K74zp.ttf";
import SignericaFont from "../fonts/SignericaMedium-RXOo.ttf";

export const loadFont = async (fontName, fontUrl) => {
  try {
    const response = await fetch(fontUrl);
    if (!response.ok) throw new Error(`Failed to fetch font: ${fontName}`);
    return await response.arrayBuffer();
  } catch (error) {
    console.error(`Error loading font ${fontName}:`, error);
    throw error;
  }
};

export const availableFonts = {
  Autograf: AutografFont,
  "Danny Brassco": DannyBrasscoFont,
  Motterdam: MotterdamFont,
  Signerica: SignericaFont,
};

export const fontDisplayNames = Object.keys(availableFonts);
