from flask import Flask
from flask_cors import CORS
from config import Config

def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)
    
    # Initialize Firebase
    from firebase_config import db as firestore_db
    app.firestore_db = firestore_db
    
    CORS(app)
    
    # Register blueprints
    from routes.home import home_bp
    from routes.gantt import gantt_bp
    from routes.chatbot import chatbot_bp  # ← ADD THIS
    from routes.tables import tables_bp
    
    app.register_blueprint(home_bp)
    app.register_blueprint(gantt_bp)
    app.register_blueprint(chatbot_bp)  # ← ADD THIS
    app.register_blueprint(tables_bp)
    
    return app

if __name__ == '__main__':
    app = create_app()
    app.run(debug=True, port=5001)