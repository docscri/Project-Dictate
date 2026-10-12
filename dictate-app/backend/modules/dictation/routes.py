from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    WebSocket,
    WebSocketDisconnect,
)

from modules.dictation.schemas import DictationFinishRequest
from modules.dictation.service import (
    finish_dictation,
    handle_dictation_stream,
    process_finished_dictation,
)
from shared.security import (
    get_current_user,
    get_websocket_user,
)


router = APIRouter(
    prefix="/api/dictation",
    tags=["Dictation"],
)


@router.websocket("/stream/{consultation_id}")
async def dictation_stream(
    websocket: WebSocket,
    consultation_id: str,
):
    user = get_websocket_user(websocket)

    await websocket.accept()

    try:
        await handle_dictation_stream(
            websocket=websocket,
            user_id=user.id,
            consultation_id=consultation_id,
        )

    except WebSocketDisconnect:
        pass


@router.post("/finish")
def finish_dictation_route(
    data: DictationFinishRequest,
    background_tasks: BackgroundTasks,
    user=Depends(get_current_user),
):
    consultation = finish_dictation(
        user.id,
        data.consultation_id,
    )

    if consultation is None:
        raise HTTPException(
            status_code=404,
            detail="Consultation not found",
        )

    background_tasks.add_task(
        process_finished_dictation,
        user.id,
        data.consultation_id,
    )

    return {
        "consultation_id": data.consultation_id,
        "status": "processing",
        "processing_stage": "finalizing_transcript",
    }