# Dictate

Dictate is a React and FastAPI clinical dictation app. From `dictate-app/backend`, create local files from `setup/.env.example` and `setup/config.example.yaml`, install with `..\\.venv\\Scripts\\python.exe -m pip install -r setup\\requirements-dev.txt`, and run `..\\.venv\\Scripts\\python.exe -m uvicorn main:app --reload --port 8000`; in a second shell run `npm install` and `npm run dev` from `dictate-app/frontend`, then open `http://localhost:5173`. See [architecture](dictate-app/docs/architecture.md) for structure and [product](dictate-app/docs/product.md) for behavior.
