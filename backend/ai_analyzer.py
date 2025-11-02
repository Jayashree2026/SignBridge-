import os
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

# Initialize Gemini client
client = OpenAI(
    api_key=os.getenv("GEMINI_API_KEY"),
    base_url="https://generativelanguage.googleapis.com/v1beta/openai/"
)
def analyze_transcript(text: str, analysis_type: str = "summary", custom_prompt: str = "") -> str:
    """
    Analyze a transcript with Gemini AI.
    analysis_type options: summary, sentiment, keywords, custom
    """
    try:
        # Build user prompt
        if analysis_type == "summary":
            prompt = f"Summarize the following text concisely:\n{text}"
        elif analysis_type == "sentiment":
            prompt = f"Analyze the sentiment of this text and give a concise result (Positive/Neutral/Negative):\n{text}"
        elif analysis_type == "keywords":
            prompt = f"Extract the most important keywords from the following text:\n{text}"
        elif analysis_type == "custom" and custom_prompt:
            prompt = f"{custom_prompt}\n\nText:\n{text}"
        else:
            prompt = f"Analyze the following text:\n{text}"

        # Call Gemini AI
        response = client.chat.completions.create(
            model="gemini-2.5-flash",
            messages=[
                {"role": "system", "content": "You are a helpful assistant."},
                {"role": "user", "content": prompt}
            ]
        )

        # Extract content safely for OpenAI v2.x
        choice = response.choices[0]
        if hasattr(choice, "message") and hasattr(choice.message, "content"):
            return choice.message.content
        elif hasattr(choice, "content"):
            return choice.content
        else:
            return str(choice)

    except Exception as e:
        print(f"❌ Gemini AI analysis failed: {e}")
        return f"Error: Could not analyze text. {str(e)}"

  
def is_available() -> bool:
    """
    Check if Gemini API is reachable
    """
    try:
        test = client.chat.completions.create(
            model="gemini-2.5-flash",
            messages=[{"role": "system", "content": "You are testing connectivity."},
                      {"role": "user", "content": "Hello"}]
        )
        return True
    except Exception as e:
        print(f"⚠️ Gemini API not available: {e}")
        return False
