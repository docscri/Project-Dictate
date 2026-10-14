from pathlib import Path
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware


load_dotenv(Path(__file__).resolve().parent / ".env")


from modules.auth.routes import router as auth_router
from modules.profile.routes import router as profile_router
from modules.patients.routes import router as patients_router
from modules.consultations.routes import router as consultations_router
from modules.dictation.routes import router as dictation_router
from modules.note_formatter.routes import router as note_formatter_router
from shared.config import config
from shared.logger import get_logger
from shared.errors import install_error_handlers


logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Dictate backend started")
    yield


app = FastAPI(
    title=config["app"]["name"],
    lifespan=lifespan,
)
install_error_handlers(app)
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.get("cors", {}).get("allowed_origins", []),
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


app.include_router(auth_router)
app.include_router(profile_router)
app.include_router(patients_router)
app.include_router(consultations_router)
app.include_router(dictation_router)
app.include_router(note_formatter_router)

@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "service": config["app"]["name"],
        "environment": config["app"]["environment"],
    }
