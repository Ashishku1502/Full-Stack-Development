const axios = require('axios');

class GeminiService {
  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY;
    this.baseURL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent';
    this.rateLimit = {
      requests: 0,
      lastReset: Date.now(),
      maxRequests: 60, // 60 requests per minute
      resetInterval: 60000 // 1 minute
    };
  }

  // Simple in-memory rate limiter
  checkRateLimit() {
    const now = Date.now();
    if (now - this.rateLimit.lastReset > this.rateLimit.resetInterval) {
      this.rateLimit.requests = 0;
      this.rateLimit.lastReset = now;
    }

    if (this.rateLimit.requests >= this.rateLimit.maxRequests) {
      throw new Error('Rate limit exceeded. Please try again later.');
    }

    this.rateLimit.requests++;
  }

  // Generate summary using Gemini API
  async generateSummary(notes) {
    try {
      if (!this.apiKey) {
        throw new Error('Gemini API key not configured');
      }

      this.checkRateLimit();

      if (!notes || notes.length === 0) {
        return 'No notes available to summarize.';
      }

      // Prepare the prompt
      const notesText = notes.join('\n- ');
      const prompt = `Please provide a concise summary of the following invoice item notes. Focus on key themes, issues, or important details mentioned:

- ${notesText}

Summary:`;

      const requestBody = {
        contents: [{
          parts: [{
            text: prompt
          }]
        }],
        generationConfig: {
          temperature: 0.3,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 500,
        },
        safetySettings: [
          {
            category: "HARM_CATEGORY_HARASSMENT",
            threshold: "BLOCK_MEDIUM_AND_ABOVE"
          },
          {
            category: "HARM_CATEGORY_HATE_SPEECH",
            threshold: "BLOCK_MEDIUM_AND_ABOVE"
          },
          {
            category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
            threshold: "BLOCK_MEDIUM_AND_ABOVE"
          },
          {
            category: "HARM_CATEGORY_DANGEROUS_CONTENT",
            threshold: "BLOCK_MEDIUM_AND_ABOVE"
          }
        ]
      };

      const response = await axios.post(
        `${this.baseURL}?key=${this.apiKey}`,
        requestBody,
        {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: 30000 // 30 second timeout
        }
      );

      if (response.data && response.data.candidates && response.data.candidates[0]) {
        const summary = response.data.candidates[0].content.parts[0].text.trim();
        return summary || 'Unable to generate summary.';
      } else {
        throw new Error('Invalid response from Gemini API');
      }

    } catch (error) {
      console.error('Gemini API Error:', error.message);
      
      if (error.response) {
        // API error response
        const status = error.response.status;
        const data = error.response.data;
        
        if (status === 429) {
          throw new Error('Rate limit exceeded. Please try again later.');
        } else if (status === 400) {
          throw new Error('Invalid request to AI service.');
        } else if (status === 401) {
          throw new Error('AI service authentication failed.');
        } else if (status === 403) {
          throw new Error('AI service access denied.');
        } else {
          throw new Error(`AI service error: ${data?.error?.message || 'Unknown error'}`);
        }
      } else if (error.code === 'ECONNABORTED') {
        throw new Error('AI service request timed out.');
      } else if (error.code === 'ENOTFOUND') {
        throw new Error('AI service unavailable.');
      } else {
        throw new Error(`AI service error: ${error.message}`);
      }
    }
  }

  // Generate summary with retry logic
  async generateSummaryWithRetry(notes, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.generateSummary(notes);
      } catch (error) {
        console.error(`Attempt ${attempt} failed:`, error.message);
        
        if (attempt === maxRetries) {
          throw error;
        }
        
        // Wait before retrying (exponential backoff)
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  // Health check for the service
  async healthCheck() {
    try {
      if (!this.apiKey) {
        return { status: 'error', message: 'API key not configured' };
      }

      // Try a simple request
      const testNotes = ['Test note for health check'];
      await this.generateSummary(testNotes);
      
      return { status: 'healthy', message: 'Gemini service is working' };
    } catch (error) {
      return { 
        status: 'error', 
        message: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
}

// Create singleton instance
const geminiService = new GeminiService();

// Export functions
module.exports = {
  generateSummary: (notes) => geminiService.generateSummaryWithRetry(notes),
  healthCheck: () => geminiService.healthCheck(),
  geminiService // Export instance for testing
};
