# scheduler.py
import schedule
import time
from scraper import scrape_asu_hockey_roster

def job():
    print("Running daily update...")
    scrape_asu_hockey_roster()
    print("Update complete!")

# Run once at startup
job()

# Schedule daily run at 2 AM
schedule.every().day.at("02:00").do(job)

while True:
    schedule.run_pending()
    time.sleep(60)
