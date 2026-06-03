import asyncio
import logging
from app.services.ai_analysis import analyze_machine

logging.basicConfig(level=logging.DEBUG)

async def main():
    result = await analyze_machine(
        hostname="test-host",
        latest_metrics={"cpu": 90, "ram": 70, "disk": 10, "latency_ms": 50},
        inventory={"disk_type": "SSD", "gpu_type": "Discrete"},
        alerts=[],
        last_seen_minutes=1.0,
    )
    print("ANALYSIS RESULT:\n", result)

if __name__ == '__main__':
    asyncio.run(main())
