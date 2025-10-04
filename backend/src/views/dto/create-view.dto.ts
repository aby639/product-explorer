import { IsArray, IsString } from 'class-validator';

export class CreateViewDto {
  @IsString()
  sessionId!: string;

  @IsArray()
  pathJson!: string[];
}
