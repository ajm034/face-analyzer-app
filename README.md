# Face Analyzer Application

This application uses AI to analyze facial features and provide aesthetic recommendations for clinic services.

## Project Structure

- `/backend` - Node.js backend with OpenAI integration
- `/frontend` - Static frontend files

## Backend

The backend is a Node.js Express application that:
- Processes facial images using OpenAI's vision capabilities
- Analyzes detected features
- Recommends appropriate aesthetic treatments
- Generates PDF reports

### Environment Variables

The backend requires the following environment variables:
- `OPENAI_API_KEY` - Your OpenAI API key

## Frontend

The frontend is a static web application that:
- Allows users to upload facial images
- Displays analysis results and recommendations
- Generates downloadable PDF reports

## Deployment

This application is configured for deployment on Render:

### Backend Deployment
- Environment: Node.js
- Build Command: `npm install`
- Start Command: `npm start`
- Root Directory: `/backend`

### Frontend Deployment
- Type: Static Site
- Publish Directory: `/frontend`

## Local Development

To run the application locally:

1. Install backend dependencies:
```
cd backend
npm install
```

2. Create a `.env` file in the backend directory with your OpenAI API key:
```
OPENAI_API_KEY=your_api_key_here
```

3. Start the backend server:
```
npm start
```

4. Serve the frontend files using any static file server.

5. Update the API URL in `frontend/app.js` to point to your backend server.
