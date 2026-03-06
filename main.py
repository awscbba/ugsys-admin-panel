"""Lambda entrypoint — wraps the FastAPI app with Mangum for AWS Lambda + API Gateway."""

from mangum import Mangum

from src.main import app

# Mangum adapts ASGI (FastAPI) to the Lambda event/context interface.
# lifespan="off" because Lambda doesn't support persistent lifespan events;
# startup/shutdown logic is handled inside the FastAPI lifespan context manager
# which Mangum will invoke per cold start.
handler = Mangum(app, lifespan="auto")
