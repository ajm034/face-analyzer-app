import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import OpenAI from 'openai';
import cors from 'cors';

// 1
const servicesFilePath = new URL('./services.json', import.meta.url);
const services = JSON.parse(fs.readFileSync(servicesFilePath, 'utf8'));

// 2
const app = express();
app.use(cors());
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.get('/', (_req, res) => res.send('Face-Analyzer is live.'));
app.use(express.raw({ type: '*/*', limit: '10mb' }));

function extractJsonFromString(str) {
  if (!str || typeof str !== 'string') return null;
  const markdownMatch = str.match(/```json\n([\s\S]*?)\n```/);
  if (markdownMatch && markdownMatch[1]) {
    try {
      JSON.parse(markdownMatch[1]);
      return markdownMatch[1];
    } catch (e) { /* ignore */ }
  }
  const firstBrace = str.indexOf('{');
  const lastBrace = str.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const potentialJson = str.substring(firstBrace, lastBrace + 1);
    try {
      JSON.parse(potentialJson);
      return potentialJson;
    } catch (e) { /* ignore */ }
  }
  try {
    JSON.parse(str);
    return str;
  } catch (e) { /* ignore */ }
  return null;
}

// Enhanced Weighted Recommendation Algorithm with Flexible Matching
function weightedRecommendationAlgorithm(detectedFeatures, allServices) {
    const serviceScores = [];
    const stopWords = new Set(['and', 'or', 'the', 'a', 'for', 'in', 'to', 'of', 'with', 'on', 'is', 'it', '']);

    function getKeywords(text) {
        if (!text) return [];
        return text.toLowerCase().replace(/[^\[\w\s'-]/g, '').split(/\s+/).filter(word => !stopWords.has(word) && word.length > 2);
    }

    for (const category in allServices) {
        allServices[category].forEach(service => {
            let currentServiceScore = 0;
            const serviceNameLower = service.name.toLowerCase();
            const serviceNameKeywords = getKeywords(service.name);

            const problemsKeywords = (service.problems_treated || []).flatMap(p => getKeywords(p));
            const enhancementsKeywords = (service.enhancements || []).flatMap(e => getKeywords(e));
            const descriptionKeywords = getKeywords(service.description);

            detectedFeatures.forEach(feature => {
                const featureLower = feature.toLowerCase().trim();
                const featureKeywords = getKeywords(featureLower);
                let featureScore = 0;

                // 1. Direct Name Match (High Score)
                if (serviceNameLower.includes(featureLower) || featureLower.includes(serviceNameLower)) {
                    featureScore += 25;
                }

                // 2. Phrase Match in Problems/Enhancements (Strong Score)
                (service.problems_treated || []).forEach(problem => {
                    if (problem.toLowerCase().includes(featureLower)) {
                        featureScore += 20;
                    }
                });
                (service.enhancements || []).forEach(enhancement => {
                    if (enhancement.toLowerCase().includes(featureLower)) {
                        featureScore += 15;
                    }
                });

                // 3. Keyword Overlap Score (More Flexible)
                let problemKeywordMatches = 0;
                problemsKeywords.forEach(pk => {
                    if (featureKeywords.includes(pk)) problemKeywordMatches++;
                });
                featureScore += problemKeywordMatches * 3; // Score per matching problem keyword

                let enhancementKeywordMatches = 0;
                enhancementsKeywords.forEach(ek => {
                    if (featureKeywords.includes(ek)) enhancementKeywordMatches++;
                });
                featureScore += enhancementKeywordMatches * 2; // Score per matching enhancement keyword
                
                let nameKeywordMatches = 0;
                serviceNameKeywords.forEach(nk => {
                    if (featureKeywords.includes(nk)) nameKeywordMatches++;
                });
                featureScore += nameKeywordMatches * 1; // Lower score for name keywords if not a full phrase match

                let descriptionKeywordMatches = 0;
                descriptionKeywords.forEach(dk => {
                    if (featureKeywords.includes(dk)) descriptionKeywordMatches++;
                });
                featureScore += descriptionKeywordMatches * 0.5; // Lowest score for description keywords

                currentServiceScore += featureScore;
            });

            if (currentServiceScore > 0) {
                serviceScores.push({ service, score: currentServiceScore });
            }
        });
    }
    serviceScores.sort((a, b) => b.score - a.score);
    console.log("Algorithm Scores:", serviceScores.slice(0,10).map(s => ({name: s.service.name, score: s.score}))); // Log top 10 scores for debugging
    return serviceScores.slice(0, 5).map(item => item.service);
}

app.post('/analyze', async (req, res) => {
  console.log('✅ Received /analyze:', req.body.length, 'bytes');
  try {
    const b64 = req.body.toString('base64');
    const dataUri = `data:image/jpeg;base64,${b64}`;

    const featureDetectionSystemPrompt = [
        'You are an expert facial analysis AI.',
        'Analyze the provided image of a face. List all observed skin conditions, signs of aging, and potential areas for aesthetic enhancement.',
        'You MUST respond with a single, valid JSON object.',
        'This JSON object MUST have a single key named "detected_features".',
        'The value of "detected_features" MUST be a JSON array of strings (e.g., ["forehead wrinkles", "dull skin tone", "uneven pigmentation", "desire for fuller lips"]).',
        'Focus on actionable observations relevant for aesthetic treatments. Be concise. Include both problems and desired enhancements. Use descriptive phrases.',
        'Do NOT include any introductory text, concluding remarks, markdown formatting, or any other text outside of the JSON object.'
    ].join('\n');

    const featureDetectionCompletion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
            { role: 'system', content: featureDetectionSystemPrompt },
            {
                role: 'user',
                content: [
                    { type: 'text', text: 'Analyze this image and list detected features (both problems and desired enhancements) for aesthetic recommendations. Be specific and use common aesthetic terms.' },
                    { type: 'image_url', image_url: { url: dataUri } },
                ],
            },
        ],
        max_tokens: 500,
        response_format: { type: "json_object" }
    });

    let rawFeatureResponse = featureDetectionCompletion.choices[0].message.content;
    console.log("Raw OpenAI Feature Detection response:", rawFeatureResponse);
    let jsonFeatureText = extractJsonFromString(rawFeatureResponse);
    let parsedFeatureResponse;
    if (!jsonFeatureText) {
        console.error('⚠️ Could not extract valid JSON for features. Raw:', rawFeatureResponse);
        return res.status(502).json({ error: 'Feature detection model did not return parseable JSON.', raw: rawFeatureResponse });
    }
    try {
        parsedFeatureResponse = JSON.parse(jsonFeatureText);
    } catch (e) {
        console.error('⚠️ JSON parse error for features:', e.message, 'Cleaned:', jsonFeatureText);
        return res.status(502).json({ error: 'Feature detection model returned invalid JSON.', raw: rawFeatureResponse, cleaned: jsonFeatureText });
    }

    if (!parsedFeatureResponse || !parsedFeatureResponse.detected_features || !Array.isArray(parsedFeatureResponse.detected_features)) {
        console.error('⚠️ Feature detection JSON has unexpected structure:', parsedFeatureResponse);
        return res.status(502).json({ error: 'Feature detection JSON in unexpected format.', raw: rawFeatureResponse, parsed: parsedFeatureResponse });
    }
    const detectedFeatures = parsedFeatureResponse.detected_features;
    console.log("Detected Features:", detectedFeatures);

    if (detectedFeatures.length === 0) {
        return res.json({ recommendations: [{ service_name: "No Specific Issues or Enhancements Detected", type: "Observation", explanation: "The image analysis did not identify specific features requiring targeted treatment recommendations at this time. A general consultation might be beneficial.", relevant_features: [] }] });
    }

    const topServices = weightedRecommendationAlgorithm(detectedFeatures, services);
    console.log("Top Services from Algorithm:", topServices.map(s=>s.name));

    if (topServices.length === 0) {
         return res.json({ recommendations: [{ service_name: "Consultation Recommended", type: "General Advice", explanation: "While features were detected, our algorithm couldn't pinpoint specific services with high confidence. A consultation is recommended to discuss your goals and explore suitable options.", relevant_features: detectedFeatures }] });
    }

    const finalRecSystemPrompt = [
        'You are a medical-aesthetic assistant.',
        'You MUST respond with a single, valid JSON object.',
        'This JSON object MUST have a key named "recommendations".',
        'The value of "recommendations" MUST be a JSON array of objects.',
        'Each object in the "recommendations" array MUST have keys: "service_name" (string), "type" (string: "Problem-Solving" or "Aesthetic Enhancement"), "explanation" (string), and "relevant_features" (array of strings).',
        'The "explanation" should be based on the service details provided (problems_treated, enhancements, description) and clearly link to the detected_features.',
        'Determine the "type" based on whether the primary detected features it addresses are problems or enhancements. If it addresses both, lean towards the primary reason for recommendation based on the detected features.',
        'Do NOT include any introductory text, concluding remarks, markdown formatting, or any other text outside of the JSON object.'
    ].join('\n');

    let topServicesForPrompt = "Based on an initial analysis, the following services are potentially suitable. Please refine these into final recommendations. For each service, consider its listed problems_treated and enhancements:\n";
    topServices.forEach(service => {
        topServicesForPrompt += `- Service: ${service.name}\n  Description: ${service.description || 'N/A'}\n  Problems Treated: ${(service.problems_treated || []).join('; ') || 'N/A'}\n  Enhancements: ${(service.enhancements || []).join('; ') || 'N/A'}\n`;
    });

    const finalUserPrompt = `\nThe image analysis detected these features: ${JSON.stringify(detectedFeatures)}.\n\n${topServicesForPrompt}\n\nFrom the list of potentially suitable services, select up to 3-4 final recommendations. For each:\n1. State "service_name".\n2. Determine "type" as "Problem-Solving" or "Aesthetic Enhancement" based on the detected features it primarily addresses and the service's capabilities.\n3. Write an "explanation" that clearly links the service (using its description, problems_treated, and enhancements) to the specific detected_features it addresses. Make the explanation concise and informative.\n4. List the "relevant_features" (from the detected features list) that justify this service.\n`;

    const finalCompletion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
            { role: 'system', content: finalRecSystemPrompt },
            { role: 'user', content: finalUserPrompt.trim() },
        ],
        max_tokens: 1500,
        response_format: { type: "json_object" }
    });

    let rawFinalResponse = finalCompletion.choices[0].message.content;
    console.log("Raw OpenAI Final Recommendation response:", rawFinalResponse);
    let jsonFinalText = extractJsonFromString(rawFinalResponse);
    let parsedFinalResponse;

    if (!jsonFinalText) {
        console.error('⚠️ Could not extract valid JSON for final recommendations. Raw:', rawFinalResponse);
        return res.status(502).json({ error: 'Final recommendation model did not return parseable JSON.', raw: rawFinalResponse });
    }
    try {
        parsedFinalResponse = JSON.parse(jsonFinalText);
    } catch (e) {
        console.error('⚠️ JSON parse error for final recommendations:', e.message, 'Cleaned:', jsonFinalText);
        return res.status(502).json({ error: 'Final recommendation model returned invalid JSON.', raw: rawFinalResponse, cleaned: jsonFinalText });
    }

    if (parsedFinalResponse && parsedFinalResponse.recommendations && Array.isArray(parsedFinalResponse.recommendations)) {
        res.json({ recommendations: parsedFinalResponse.recommendations });
    } else {
        console.error('⚠️ Final recommendations JSON has unexpected structure:', parsedFinalResponse);
        return res.status(502).json({ error: 'Final recommendations JSON in unexpected format.', raw: rawFinalResponse, parsed: parsedFinalResponse });
    }

  } catch (err) {
    console.error('❌ Error in /analyze:', err);
    if (err instanceof OpenAI.APIError) {
        console.error('OpenAI API Error:', err.status, err.code, err.message);
        return res.status(err.status || 500).json({ error: err.message, details: err.error });
    }
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () =>
  console.log(`Listening on http://0.0.0.0:${PORT}`)
);

