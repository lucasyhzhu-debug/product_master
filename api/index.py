from mangum import Mangum
from app.main import app

# Set root path for Vercel deployment
app.root_path = "/api"

# Mangum handler wraps ASGI app for Vercel serverless
handler = Mangum(app, lifespan="off")
