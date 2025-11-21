import React, { useState } from 'react';
import { Card, Button } from './UIComponents';
import { Survey } from '../types';
import { analyzeSurvey } from '../services/geminiService';

interface ChatAssistantProps {
  survey: Survey;
  onClose: () => void;
}

export const ChatAssistant: React.FC<ChatAssistantProps> = ({ survey, onClose }) => {
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleAnalyze = async () => {
    setLoading(true);
    try {
      const result = await analyzeSurvey(survey);
      setAnalysis(result);
    } catch (e) {
      setAnalysis("Failed to analyze.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card title="AI Survey Assistant" onClose={onClose} className="w-full max-w-md absolute top-20 right-4 z-[1000]">
      {!analysis ? (
        <div className="space-y-4">
          <p className="text-slate-300 text-sm">
            Use Gemini AI to analyze this survey's geometry, suggest land usage, and verify surveying quality.
          </p>
          <div className="bg-blue-900/20 p-4 rounded-lg border border-blue-800/50">
            <h4 className="text-blue-400 font-semibold text-sm mb-2">Current Data</h4>
            <ul className="text-xs text-slate-400 space-y-1">
              <li>Points: {survey.points.length}</li>
              <li>Area calculated automatically</li>
            </ul>
          </div>
          <Button onClick={handleAnalyze} disabled={loading || survey.points.length < 3} className="w-full">
            {loading ? <i className="fas fa-spinner fa-spin" /> : <i className="fas fa-magic" />}
            {loading ? 'Analyzing...' : 'Analyze Survey'}
          </Button>
          {survey.points.length < 3 && (
            <p className="text-red-400 text-xs text-center">Add at least 3 points to analyze area.</p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
            <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700 max-h-64 overflow-y-auto prose prose-invert prose-sm">
                <div dangerouslySetInnerHTML={{ __html: analysis.replace(/\n/g, '<br />') }} />
            </div>
            <Button variant="secondary" onClick={() => setAnalysis(null)} className="w-full">
                Reset Analysis
            </Button>
        </div>
      )}
    </Card>
  );
};