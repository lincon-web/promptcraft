import json
import os
import time
from collections import defaultdict
from typing import Literal

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, SecretStr

load_dotenv()
print("Groq key loaded:", bool(os.getenv("GROQ_API_KEY")))
print("Groq model loaded:", bool(os.getenv("GROQ_MODEL")))

app = FastAPI(title="PromptCraft API", version="2.0.0")


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==========================================
# PROVIDER CONFIGURATION
# ==========================================

PROVIDERS = {
    "openai": {
        "name": "OpenAI",
        "url": "https://api.openai.com/v1/chat/completions",
        "format": "openai"
    },
    "groq": {
        "name": "Groq",
        "url": "https://api.groq.com/openai/v1/chat/completions",
        "format": "openai"
    },
    "openrouter": {
        "name": "OpenRouter",
        "url": "https://openrouter.ai/api/v1/chat/completions",
        "format": "openai"
    },
    "gemini": {
        "name": "Google Gemini",
        "url": "https://generativelanguage.googleapis.com/v1beta/models/",
        "format": "gemini"
    }
}


# ==========================================
# REQUEST MODELS
# ==========================================

class AIRequest(BaseModel):
    provider: Literal["openai", "groq", "gemini", "openrouter"]
    api_key: SecretStr
    model: str = Field(min_length=1, max_length=150)


class PromptRequest(AIRequest):
    prompt: str
    strategy: str


class GenerateRequest(AIRequest):
    improved_prompt: str


class BestPromptRequest(AIRequest):
    original: str
    zero: str
    few: str
    reasoning: str

class QuickOptimizeRequest(BaseModel):
    prompt: str = Field(
        min_length=1,
        max_length=5000
    )   


# ==========================================
# PROMPT STRATEGIES
# ==========================================


SYSTEM_PROMPTS = {
    "zero-shot": """
You are PromptCraft, an expert prompt engineer.

Your task is to transform the user's original request into a
professional, complete, standalone prompt that can be pasted directly
into any compatible AI assistant.

CORE REQUIREMENTS:
1. Preserve the user's original intent. Never change the task.
2. Correct spelling, grammar, and unclear wording.
3. Define an appropriate role or expertise when useful.
4. Add relevant context that helps the AI understand the task.
5. Specify the exact work the AI should perform.
6. Add practical constraints, boundaries, and quality requirements.
7. Define a clear output format and appropriate level of detail.
8. Resolve ambiguity where possible without inventing user preferences.
9. Include references only when they are supplied, reliable, or genuinely
   useful. Never fabricate sources, citations, statistics, or evidence.
10. Do not add unnecessary sections or instructions just to make the
    prompt look longer.

STANDALONE USABILITY:
The resulting prompt must make sense independently of this conversation.
It must not refer to the optimization process, the original prompt,
PromptCraft, or these instructions.

STRATEGY:
Use a direct, zero-shot approach. Make the instructions precise and
effective without adding artificial examples.

Return a JSON object with exactly these fields:
{
  "improved_prompt": "The complete ready-to-use prompt",
  "improvements": [
    "A specific explanation of an improvement and why it matters"
  ]
}

Provide 3 to 6 meaningful improvement explanations.
Return valid JSON only. Do not use Markdown fences.
""",

    "few-shot": """
You are PromptCraft, an expert prompt engineer specializing in
example-guided prompt design.

Transform the user's original request into a professional,
complete, standalone prompt that can be pasted directly into any
compatible AI assistant.

CORE REQUIREMENTS:
1. Preserve the user's original intention and task.
2. Correct spelling, grammar, and unclear wording.
3. Establish a relevant role and context where useful.
4. Define clear instructions, constraints, and output expectations.
5. Add examples only when they genuinely help demonstrate the desired
   response, style, reasoning approach, or format.
6. Examples must be short, relevant, and clearly illustrative.
7. Never present invented statistics, sources, research, or real-world
   claims as facts.
8. Do not force examples into tasks where they add no meaningful value.
9. Keep the final prompt practical, concise, and self-contained.

STANDALONE USABILITY:
The prompt must work independently when copied into another AI.
It must not refer to PromptCraft or the optimization process.

STRATEGY:
Use example-guided instructions when appropriate. If examples would not
improve the task, use a suitable alternative instruction structure.

Return a JSON object with exactly these fields:
{
  "improved_prompt": "The complete ready-to-use prompt",
  "improvements": [
    "A specific explanation of an improvement and why it matters"
  ]
}

Provide 3 to 6 meaningful improvement explanations.
Return valid JSON only. Do not use Markdown fences.
""",

    "reasoning-guided": """
You are PromptCraft, an expert prompt engineer specializing in
complex task design and quality-controlled instructions.

Transform the user's original request into a professional,
complete, standalone prompt that can be pasted directly into any
compatible AI assistant.

CORE REQUIREMENTS:
1. Preserve the user's original objective.
2. Correct spelling, grammar, and ambiguity.
3. Define the relevant role, context, and task.
4. Break complex tasks into logical stages or subtasks where useful.
5. Instruct the target AI to examine relevant requirements carefully,
   check consistency, and verify that its final response satisfies
   the requested task.
6. Add appropriate constraints, assumptions, and quality checks.
7. Specify a clear and useful output format.
8. Encourage accuracy and acknowledgement of uncertainty.
9. Never instruct the target AI to fabricate evidence, sources,
   statistics, or capabilities.
10. Do not request disclosure of private internal reasoning.
11. Avoid unnecessary complexity and preserve the user's intended scope.

STANDALONE USABILITY:
The final prompt must work independently in any compatible AI assistant.
It must not mention PromptCraft or the optimization process.

STRATEGY:
Use structured task instructions, logical stages, and explicit
quality checks. Request conclusions and concise explanations rather
than hidden internal reasoning.

Return a JSON object with exactly these fields:
{
  "improved_prompt": "The complete ready-to-use prompt",
  "improvements": [
    "A specific explanation of an improvement and why it matters"
  ]
}

Provide 3 to 6 meaningful improvement explanations.
Return valid JSON only. Do not use Markdown fences.
"""
}

# ==========================================
# QUICK OPTIMIZE SYSTEM PROMPT
# ==========================================

QUICK_OPTIMIZE_SYSTEM = """
You are PromptCraft, an expert prompt engineer.

Your task is to improve the user's prompt and return ONE
complete, ready-to-use optimized prompt.

CORE PRINCIPLES:

1. Preserve the original user's intent, task, scope and ambition.
2. Improve clarity, grammar, wording and instruction quality.
3. Make the prompt independently understandable.
4. Add a role, context or constraints only when genuinely useful.
5. Specify an output format only when necessary or clearly implied.
6. Never invent additional tasks, deliverables or requirements.
7. Never add arbitrary minimum quantities, tables, word counts,
   examples or restrictions.
8. Do not make simple requests unnecessarily complicated.
9. Do not add unnecessary instructions merely to make the
   optimized prompt longer.
10. Never request disclosure of hidden internal reasoning.

IMPORTANT:
Improve the instruction, not the user's ambition.

A simple question should remain a simple, improved question.
A complex task should retain the detail necessary to execute it.

FINAL CHECK:
Before returning the result, verify that it still asks for
exactly what the user originally wanted.

OUTPUT:
Return ONLY the final optimized prompt.
Do not explain the changes.
Do not include introductory statements.
Do not use Markdown code fences.
"""

# ==========================================
# UNIFIED AI PROVIDER ENGINE
# ==========================================

async def call_ai(
    provider: str,
    api_key: str,
    model: str,
    system: str,
    user: str
) -> str:

    config = PROVIDERS.get(provider)

    if not config:
        raise HTTPException(
            status_code=400,
            detail="Unsupported AI provider."
        )

    headers = {
        "Content-Type": "application/json"
    }

    if provider == "gemini":
        headers["x-goog-api-key"] = api_key

        url = (
            config["url"]
            + model
            + ":generateContent"
        )

        payload = {
            "systemInstruction": {
                "parts": [{"text": system}]
            },
            "contents": [
                {
                    "role": "user",
                    "parts": [{"text": user}]
                }
            ],
            "generationConfig": {
                "temperature": 0.4,
                "maxOutputTokens": 1024
            }
        }

    else:
        headers["Authorization"] = f"Bearer {api_key}"

        url = config["url"]

        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user}
            ],
            "temperature": 0.4,
            "max_tokens": 1024
        }

    try:
        async with httpx.AsyncClient(timeout=90.0) as client:

            response = await client.post(
                url,
                headers=headers,
                json=payload
            )

            if response.status_code != 200:
                raise HTTPException(
                    status_code=502,
                    detail=(
                        f"{config['name']} returned an error "
                        f"({response.status_code}). "
                        "Check your API key, model and provider account."
                    )
                )

            data = response.json()

            if provider == "gemini":
                candidates = data.get("candidates", [])

                if not candidates:
                    raise HTTPException(
                        status_code=502,
                        detail="Gemini returned no response."
                    )

                parts = candidates[0].get("content", {}).get("parts", [])

                answer = "".join(
                    part.get("text", "")
                    for part in parts
                ).strip()

            else:
                answer = (
                    data["choices"][0]["message"]["content"]
                    .strip()
                )

            if not answer:
                raise HTTPException(
                    status_code=502,
                    detail="The AI provider returned an empty response."
                )

            return answer

    except HTTPException:
        raise

    except httpx.TimeoutException:
        raise HTTPException(
            status_code=504,
            detail="The AI provider took too long to respond."
        )

    except httpx.RequestError:
        raise HTTPException(
            status_code=502,
            detail="Could not connect to the AI provider."
        )

    except (KeyError, IndexError, TypeError, ValueError):
        raise HTTPException(
            status_code=502,
            detail="Unexpected response from the AI provider."
        )


# ==========================================
# PROVIDER INFORMATION
# ==========================================

@app.get("/providers")
async def get_providers():

    return {
        "providers": [
            {
                "id": provider_id,
                "name": config["name"]
            }
            for provider_id, config in PROVIDERS.items()
        ]
    }

class TestConnectionRequest(AIRequest):
    pass


@app.post("/test-connection")
async def test_connection(request: TestConnectionRequest):
    await call_ai(
        request.provider,
        request.api_key.get_secret_value(),
        request.model,
        "You are a connection test assistant.",
        "Reply with exactly: CONNECTION SUCCESSFUL"
    )

    return {
        "status": "success",
        "message": "Your AI provider connection is working.",
        "provider": request.provider,
        "model": request.model
    }



def parse_optimization_response(raw: str) -> dict:
    """
    Extract the optimized prompt and improvement explanations
    from the AI provider's JSON response.
    """

    cleaned = raw.strip()

    # Remove accidental Markdown code fences.
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[-1]

        if cleaned.endswith("```"):
            cleaned = cleaned[:-3].strip()

    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError:
        # Handle providers that add text around the JSON object.
        start = cleaned.find("{")
        end = cleaned.rfind("}")

        if start == -1 or end == -1:
            raise HTTPException(
                status_code=502,
                detail="The AI returned an invalid optimization response."
            )

        try:
            data = json.loads(cleaned[start:end + 1])
        except json.JSONDecodeError:
            raise HTTPException(
                status_code=502,
                detail="Could not interpret the AI optimization response."
            )

    improved_prompt = data.get("improved_prompt")
    improvements = data.get("improvements")

    if not isinstance(improved_prompt, str) or not improved_prompt.strip():
        raise HTTPException(
            status_code=502,
            detail="The AI did not return a valid optimized prompt."
        )

    if not isinstance(improvements, list):
        improvements = []

    improvements = [
        item.strip()
        for item in improvements
        if isinstance(item, str) and item.strip()
    ]

    return {
        "improved_prompt": improved_prompt.strip(),
        "improvements": improvements
    }


# ==========================================
# OPTIMIZE PROMPT
# ==========================================


@app.post("/optimize")
async def optimize(request: PromptRequest):

    system = SYSTEM_PROMPTS.get(request.strategy)

    if not system:
        raise HTTPException(
            status_code=400,
            detail="Invalid optimization strategy."
        )

    raw_response = await call_ai(
        request.provider,
        request.api_key.get_secret_value(),
        request.model,
        system,
        request.prompt
    )

    result = parse_optimization_response(raw_response)

    return {
        "strategy": request.strategy,
        "improved_prompt": result["improved_prompt"],
        "improvements": result["improvements"],
        "provider": request.provider,
        "model": request.model
    }


# ==========================================
# GENERATE AI ANSWER
# ==========================================

@app.post("/generate")
async def generate(request: GenerateRequest):

    answer = await call_ai(
        request.provider,
        request.api_key.get_secret_value(),
        request.model,
        "You are a helpful assistant. Answer the user's request clearly and completely.",
        request.improved_prompt
    )

    return {
        "answer": answer,
        "provider": request.provider,
        "model": request.model
    }


# ==========================================
# GENERATE BEST PROMPT
# ==========================================

@app.post("/best")
async def best_prompt(request: BestPromptRequest):

    system = """You are an expert prompt engineer and final prompt evaluator.

Your task is to produce ONE excellent, ready-to-use prompt by
evaluating the original user request and the three optimized
versions provided.

CORE OBJECTIVE:
Create a prompt that communicates the user's original intention
more clearly, accurately and effectively without unnecessarily
expanding the task.

ORIGINAL INTENT HAS PRIORITY:

The original user prompt is the ultimate source of truth.

The three optimized versions are suggestions, not additional
user requirements.

Never assume that a detail appearing in an optimized version
was requested by the user.

Before retaining any added requirement, verify that it:
- Was explicitly requested in the original prompt, OR
- Is genuinely necessary to fulfil the original request.

Discard unnecessary additions, even if they appear in all
three optimized versions.

Never introduce arbitrary minimum quantities, equipment
requirements, tables, rep ranges, word counts, disclaimers
or extra deliverables without justification.

STRICT REQUIREMENTS:

1. Preserve the user's original intent, scope and ambition.
2. Improve clarity, grammar, specificity and instruction quality.
3. Retain useful improvements from the three strategies.
4. Add context, roles, examples or constraints only when they
   genuinely improve the requested task.
5. Specify an output format only when it is useful or clearly
   implied by the request.
6. Do not invent additional deliverables, requirements,
   sections, tables, word counts, disclaimers or restrictions.
7. Do not make simple requests unnecessarily complicated.
8. Do not force Task, Context, References, Constraints or
   Output Format headings into the final prompt.
9. Do not add examples merely to make the prompt longer.
10. Never sacrifice simplicity for unnecessary detail.

INTENT PRESERVATION:
A simple question should remain a clear, improved question.
A complex professional task should retain the detail needed
to execute it properly.
A request for a list should not automatically become a report.
A request for an explanation should not automatically become
a structured research assignment.

FINAL QUALITY TEST:
Before responding, check:
- Does this prompt still ask for what the user originally wanted?
- Have unnecessary requirements been introduced?
- Can the user paste it directly into another AI?
- Is every added instruction genuinely useful?

If an instruction does not improve the result, remove it.

Return ONLY the final, complete, ready-to-use prompt.
Do not explain your improvements.
Do not include analysis or markdown fences."""

    user = f"""Original prompt:
{request.original}

Zero-shot version:
{request.zero}

Few-shot version:
{request.few}

Reasoning-guided version:
{request.reasoning}

Create the single best final prompt now."""

    best = await call_ai(
        request.provider,
        request.api_key.get_secret_value(),
        request.model,
        system,
        user
    )

    return {
        "best_prompt": best,
        "provider": request.provider,
        "model": request.model
    }

# ==========================================
# QUICK OPTIMIZE — PROMPTCRAFT GROQ
# ==========================================

# Basic in-memory rate limiter.
# Maximum 10 requests per IP address per minute.

quick_request_history = defaultdict(list)

QUICK_RATE_LIMIT = 10
QUICK_RATE_WINDOW = 60


@app.post("/quick-optimize")
async def quick_optimize(
    request: QuickOptimizeRequest,
    client_request: Request
):

    # Validate prompt contents.
    prompt = request.prompt.strip()

    if not prompt:
        raise HTTPException(
            status_code=400,
            detail="Please enter a prompt to optimize."
        )

    # Basic request rate limiting.
    client_ip = (
        client_request.client.host
        if client_request.client
        else "unknown"
    )

    current_time = time.time()

    recent_requests = [
        timestamp
        for timestamp in quick_request_history[client_ip]
        if current_time - timestamp < QUICK_RATE_WINDOW
    ]

    if len(recent_requests) >= QUICK_RATE_LIMIT:
        raise HTTPException(
            status_code=429,
            detail="Too many requests. Please wait a minute and try again."
        )

    recent_requests.append(current_time)
    quick_request_history[client_ip] = recent_requests

    # Retrieve PromptCraft's private Groq credentials.
    groq_api_key = os.getenv("GROQ_API_KEY")
    groq_model = os.getenv("GROQ_MODEL")

    if not groq_api_key or not groq_model:
        raise HTTPException(
            status_code=503,
            detail="Quick Optimize is temporarily unavailable. Please try again later."
        )

    # Generate one optimized prompt.
    optimized_prompt = await call_ai(
        provider="groq",
        api_key=groq_api_key,
        model=groq_model,
        system=QUICK_OPTIMIZE_SYSTEM,
        user=prompt
    )

    return {
        "status": "success",
        "original_prompt": prompt,
        "optimized_prompt": optimized_prompt.strip(),
        "provider": "groq",
        "mode": "quick"
    }


# ==========================================
# HEALTH CHECK
# ==========================================

@app.get("/health")
async def health():

    return {
        "status": "ok",
        "version": "2.0.0",
        "providers": list(PROVIDERS.keys())
    }
