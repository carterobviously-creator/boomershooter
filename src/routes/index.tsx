import { createFileRoute } from "@tanstack/react-router";
import { GameApp } from "@/components/GameApp";

export const Route = createFileRoute("/")({ component: GameApp });
