#!/usr/bin/env python3
"""
Test multi-user sync functionality
Simulates two users trying to edit simultaneously
"""
import requests
import time
import uuid

BASE_URL = "http://localhost:5001"

def test_lock_acquisition():
    """Test that only one session can hold the lock"""
    print("Testing lock acquisition...")

    # Session 1
    session1_id = str(uuid.uuid4())
    response1 = requests.post(f"{BASE_URL}/api/lock/acquire", json={
        "session_id": session1_id,
        "held_by": "User 1"
    })
    print(f"Session 1 acquire: {response1.status_code}, {response1.json()}")
    assert response1.json()['ok'] == True, "Session 1 should acquire lock"

    # Session 2 tries to acquire while Session 1 holds it
    session2_id = str(uuid.uuid4())
    response2 = requests.post(f"{BASE_URL}/api/lock/acquire", json={
        "session_id": session2_id,
        "held_by": "User 2"
    })
    print(f"Session 2 acquire: {response2.status_code}, {response2.json()}")
    assert response2.json()['ok'] == False, "Session 2 should be blocked"
    assert response2.json()['held_by'] == "User 1", "Should show who holds lock"

    print("✓ Lock acquisition works correctly\n")
    return session1_id, session2_id


def test_lock_enforcement(session1_id, session2_id):
    """Test that mutating operations require the lock"""
    print("Testing lock enforcement...")

    # Session 2 tries to make changes without lock
    response = requests.post(
        f"{BASE_URL}/api/config",
        json={"test": "value"},
        headers={"X-Session-ID": session2_id}
    )
    print(f"Session 2 update config: {response.status_code}, {response.json()}")
    assert response.status_code == 403, "Should be denied without lock"
    assert 'Lock not held' in response.json().get('error', ''), "Should indicate lock error"

    # Session 1 can make changes with lock
    config = requests.get(f"{BASE_URL}/api/config").json()
    config['test_field'] = 'test_value'
    response = requests.post(
        f"{BASE_URL}/api/config",
        json=config,
        headers={"X-Session-ID": session1_id}
    )
    print(f"Session 1 update config: {response.status_code}, {response.json()}")
    assert response.status_code == 200, "Session 1 should succeed with lock"

    print("✓ Lock enforcement works correctly\n")


def test_lock_expiry(session1_id):
    """Test that locks expire after timeout"""
    print("Testing lock expiry...")

    # Release the lock
    requests.post(f"{BASE_URL}/api/lock/release", json={"session_id": session1_id})

    # Acquire new lock
    session3_id = str(uuid.uuid4())
    response = requests.post(f"{BASE_URL}/api/lock/acquire", json={
        "session_id": session3_id,
        "held_by": "User 3"
    })
    print(f"Session 3 acquire: {response.json()}")
    assert response.json()['ok'] == True

    # Wait for expiry (30 seconds + buffer)
    print("Waiting for lock to expire (31 seconds)...")
    time.sleep(31)

    # Session 4 should now be able to acquire
    session4_id = str(uuid.uuid4())
    response = requests.post(f"{BASE_URL}/api/lock/acquire", json={
        "session_id": session4_id,
        "held_by": "User 4"
    })
    print(f"Session 4 acquire after expiry: {response.json()}")
    assert response.json()['ok'] == True, "Should acquire expired lock"

    # Clean up
    requests.post(f"{BASE_URL}/api/lock/release", json={"session_id": session4_id})

    print("✓ Lock expiry works correctly\n")


def test_heartbeat():
    """Test that heartbeat keeps lock alive"""
    print("Testing heartbeat...")

    # Acquire lock
    session_id = str(uuid.uuid4())
    response = requests.post(f"{BASE_URL}/api/lock/acquire", json={
        "session_id": session_id,
        "held_by": "User 5"
    })
    assert response.json()['ok'] == True

    # Send heartbeat after 15 seconds (before 30s expiry)
    time.sleep(15)
    response = requests.post(f"{BASE_URL}/api/lock/heartbeat", json={
        "session_id": session_id
    })
    print(f"Heartbeat response: {response.json()}")
    assert response.json()['ok'] == True

    # Check lock is still held after another 20 seconds (35s total, would have expired at 30s without heartbeat)
    time.sleep(20)
    status = requests.get(f"{BASE_URL}/api/lock/status", params={"session": session_id})
    print(f"Lock status after 35s with heartbeat: {status.json()}")
    assert status.json()['is_holder'] == True, "Lock should still be held after heartbeat"

    # Clean up
    requests.post(f"{BASE_URL}/api/lock/release", json={"session_id": session_id})

    print("✓ Heartbeat works correctly\n")


if __name__ == '__main__':
    print("=" * 60)
    print("Multi-User Sync Test Suite")
    print("=" * 60 + "\n")

    try:
        session1, session2 = test_lock_acquisition()
        test_lock_enforcement(session1, session2)
        test_lock_expiry(session1)
        test_heartbeat()

        print("=" * 60)
        print("All tests passed! ✓")
        print("=" * 60)

    except AssertionError as e:
        print(f"\n✗ Test failed: {e}")
        exit(1)
    except Exception as e:
        print(f"\n✗ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        exit(1)
