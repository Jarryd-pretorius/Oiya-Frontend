import json
import websockets
import asyncio

all_clients = []


async def send_message(message: str):
    for client in all_clients:
        await client.send(message)


async def new_client_connected(client_socket):
    print("client connected")
    all_clients.append(client_socket)
    await send_message('{"name": "notification", "message": "Connected to Server"}')

    while True:
        new_message = await client_socket.recv()
        data = json.loads(new_message)

        match data['name']:
            case "input":
                print("client sent: input data")
                await send_message(new_message)


async def start_server():
    print("server started!")
    await websockets.serve(new_client_connected, "localhost", 8500)


if __name__ == '__main__':
    event_loop = asyncio.get_event_loop()
    event_loop.run_until_complete(start_server())
    event_loop.run_forever()
